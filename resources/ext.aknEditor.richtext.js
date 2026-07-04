'use strict';

/**
 * Bidirectional conversion between a live `<content>` element's real XML children and a
 * `contenteditable` HTML view of the same content, plus the DOM-Range counterpart of
 * `wrapSelection`/`wrapRange` (ext.aknEditor.toolbar.js) for use inside that view.
 *
 * Tag mapping: `b/i/u/sup/sub/ins/del/p` reuse the identical native HTML tag (confirmed
 * against AknRenderer's own renderInlineNode, AknContentHandler.php, which does the same
 * for its rendered output) since HTML documents lowercase createElement() names anyway and
 * AKN's own names for these already happen to be lowercase. Every other recognized inline
 * tag (from INLINE_TAG_BY_NAME, ext.aknEditor.vocabulary.js) becomes a
 * `<span data-akn-tag="OriginalCase">`, since arbitrary mixed-case tag names (authorialNote,
 * etc.) would otherwise get silently lowercased by the HTML document. Anything the mapper
 * doesn't recognize (table/blockList/quotedStructure/anything future) becomes a
 * non-editable placeholder carrying its own original serialized XML verbatim, so nothing
 * is ever silently dropped or corrupted.
 */

var RICHTEXT_NATIVE_TAGS = { b: true, i: true, u: true, sup: true, sub: true, ins: true, del: true };
var RICHTEXT_BLOCK_CLASS = 'akn-editor-richtext-block';

function richtextEscapeText( text ) {
	return text.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
}

function richtextEscapeAttr( value ) {
	return richtextEscapeText( value ).replace( /"/g, '&quot;' );
}

function richtextLocalName( node ) {
	return node.localName || node.nodeName;
}

/**
 * HTML attribute *names* are case-folded to lowercase on `setAttribute`, same as element
 * names — so a real attribute's original case (e.g. `refersTo`) can't survive as part of a
 * `data-akn-attr-refersTo`-style attribute name. Stored instead as one JSON-encoded bag
 * (`data-akn-attrs='{"refersTo":"#c1"}'`), where the names are just string content, not
 * attribute names, and so keep whatever case they started with.
 */
function richtextGetAttrs( el ) {
	var json = el.getAttribute( 'data-akn-attrs' );
	return json ? JSON.parse( json ) : {};
}

function richtextSetAttrs( el, attrs ) {
	el.setAttribute( 'data-akn-attrs', JSON.stringify( attrs ) );
}

function richtextSetAttr( el, name, value ) {
	var attrs = richtextGetAttrs( el );
	attrs[ name ] = value;
	richtextSetAttrs( el, attrs );
}

function richtextConvertNode( node, destDoc ) {
	if ( node.nodeType === Node.TEXT_NODE ) {
		return destDoc.createTextNode( node.textContent );
	}
	if ( node.nodeType !== Node.ELEMENT_NODE ) {
		return destDoc.createTextNode( '' );
	}

	var localName = richtextLocalName( node );
	if ( localName === 'p' ) {
		var p = destDoc.createElement( 'p' );
		Array.prototype.forEach.call( node.childNodes, function ( child ) {
			p.appendChild( richtextConvertNode( child, destDoc ) );
		} );
		return p;
	}

	var entry = INLINE_TAG_BY_NAME[ localName.toLowerCase() ];
	if ( entry ) {
		var el;
		if ( RICHTEXT_NATIVE_TAGS[ entry.tag.toLowerCase() ] ) {
			el = destDoc.createElement( entry.tag.toLowerCase() );
		} else {
			el = destDoc.createElement( 'span' );
			el.setAttribute( 'data-akn-tag', entry.tag );
		}
		if ( node.attributes.length ) {
			var attrs = {};
			Array.prototype.forEach.call( node.attributes, function ( attr ) {
				attrs[ attr.name ] = attr.value;
			} );
			richtextSetAttrs( el, attrs );
		}
		Array.prototype.forEach.call( node.childNodes, function ( child ) {
			el.appendChild( richtextConvertNode( child, destDoc ) );
		} );
		return el;
	}

	var placeholder = destDoc.createElement( 'div' );
	placeholder.className = RICHTEXT_BLOCK_CLASS;
	placeholder.setAttribute( 'contenteditable', 'false' );
	placeholder.setAttribute( 'data-akn-raw', new XMLSerializer().serializeToString( node ) );
	placeholder.textContent = mw.msg( 'aknedit-richtext-block-placeholder', localName );
	return placeholder;
}

/**
 * @param {Element|null} content The live `<content>` element (or null for an empty field).
 * @return {HTMLDivElement} A detached div, ready to become a contenteditable region.
 */
function xmlToEditable( content ) {
	var div = document.createElement( 'div' );
	if ( !content ) {
		return div;
	}

	var elementChildren = Array.prototype.filter.call( content.childNodes, function ( node ) {
		return node.nodeType === Node.ELEMENT_NODE;
	} );
	var allParagraphs = elementChildren.length > 0 && elementChildren.every( function ( node ) {
		return richtextLocalName( node ) === 'p';
	} );

	if ( allParagraphs || content.childNodes.length === 0 ) {
		Array.prototype.forEach.call( content.childNodes, function ( node ) {
			div.appendChild( richtextConvertNode( node, document ) );
		} );
	} else {
		var wrapper = document.createElement( 'p' );
		wrapper.setAttribute( 'data-akn-synthetic', '1' );
		Array.prototype.forEach.call( content.childNodes, function ( node ) {
			wrapper.appendChild( richtextConvertNode( node, document ) );
		} );
		div.appendChild( wrapper );
	}

	return div;
}

function richtextSerializeNode( node ) {
	if ( node.nodeType === Node.TEXT_NODE ) {
		return richtextEscapeText( node.textContent );
	}
	if ( node.nodeType !== Node.ELEMENT_NODE ) {
		return '';
	}
	if ( node.classList.contains( RICHTEXT_BLOCK_CLASS ) ) {
		return node.getAttribute( 'data-akn-raw' ) || '';
	}

	var tagName = node.hasAttribute( 'data-akn-tag' ) ? node.getAttribute( 'data-akn-tag' ) : node.tagName.toLowerCase();
	var attrsObj = richtextGetAttrs( node );
	var attrs = Object.keys( attrsObj ).map( function ( name ) {
		return ' ' + name + '="' + richtextEscapeAttr( attrsObj[ name ] ) + '"';
	} ).join( '' );

	var inner = Array.prototype.map.call( node.childNodes, richtextSerializeNode ).join( '' );
	return '<' + tagName + attrs + '>' + inner + '</' + tagName + '>';
}

/**
 * @param {Element} richEl The contenteditable root.
 * @return {string} Serialized XML, suitable for `RawContentField#set` (ext.aknEditor.fields.js).
 */
function editableToXmlString( richEl ) {
	var nodes = Array.prototype.slice.call( richEl.childNodes );
	if (
		nodes.length === 1 &&
		nodes[ 0 ].nodeType === Node.ELEMENT_NODE &&
		nodes[ 0 ].getAttribute( 'data-akn-synthetic' ) === '1'
	) {
		nodes = Array.prototype.slice.call( nodes[ 0 ].childNodes );
	}
	return nodes.map( richtextSerializeNode ).join( '' );
}

/**
 * The contenteditable-mode counterpart of `wrapRange` (ext.aknEditor.toolbar.js): wraps
 * `range` (or, if collapsed, inserts an empty pair at its position) in `tag`, as a native
 * element if one exists or a `data-akn-tag` span otherwise. Uses `extractContents`/
 * `insertNode` rather than `Range#surroundContents`, which throws on a selection that only
 * partially contains a non-text node. Takes an explicit Range (rather than reading
 * `window.getSelection()` itself) so a caller can capture the range before focus moves
 * elsewhere — e.g. RefDialog (ext.aknEditor.dialogs.js) needs to wrap only once the user
 * has picked a target in that modal, by which point the live selection is long gone; a
 * cloned Range stays valid as long as the nodes it points at are still in the document.
 *
 * @param {Range} range
 * @param {string} tag
 * @param {string} [attr] If set, an empty value for this attribute is recorded (via
 *   `richtextSetAttr`) for the caller to fill in once the user supplies it.
 * @return {Element} The newly wrapped element.
 */
function wrapRichRange( range, tag, attr ) {
	var el;
	if ( RICHTEXT_NATIVE_TAGS[ tag.toLowerCase() ] ) {
		el = document.createElement( tag.toLowerCase() );
	} else {
		el = document.createElement( 'span' );
		el.setAttribute( 'data-akn-tag', tag );
	}
	if ( attr ) {
		richtextSetAttr( el, attr, '' );
	}

	el.appendChild( range.extractContents() );
	range.insertNode( el );

	var sel = window.getSelection();
	var newRange = document.createRange();
	newRange.selectNodeContents( el );
	sel.removeAllRanges();
	sel.addRange( newRange );

	return el;
}

/**
 * `wrapRichRange`, sourced from the contenteditable's own current live selection.
 *
 * @param {Element} richEl The contenteditable root — the selection must be inside it.
 * @param {string} tag
 * @param {string} [attr]
 * @return {Element|null} The newly wrapped element, or null if there's no usable selection.
 */
function wrapRichSelection( richEl, tag, attr ) {
	var sel = window.getSelection();
	if ( !sel.rangeCount ) {
		return null;
	}
	var range = sel.getRangeAt( 0 );
	if ( !richEl.contains( range.commonAncestorContainer ) ) {
		return null;
	}
	return wrapRichRange( range, tag, attr );
}
