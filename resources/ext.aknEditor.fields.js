/** Attribute-backed form field: reads/writes one attribute of a (possibly absent) element. */
function AttrField( getElement, attr ) {
	this.getElement = getElement;
	this.attr = attr;
}

AttrField.prototype.get = function () {
	var el = this.getElement( false );
	return el ? el.getAttribute( this.attr ) || '' : '';
};

AttrField.prototype.set = function ( value ) {
	var el = this.getElement( true );
	if ( value === '' ) {
		el.removeAttribute( this.attr );
	} else {
		el.setAttribute( this.attr, value );
	}
};

/** Text-content-backed form field: reads/writes the textContent of a (possibly absent) child. */
function TextContentField( getElement ) {
	this.getElement = getElement;
}

TextContentField.prototype.get = function () {
	var el = this.getElement( false );
	return el ? el.textContent : '';
};

TextContentField.prototype.set = function ( value ) {
	var el = this.getElement( true );
	el.textContent = value;
};

/**
 * Content-backed field: get/set the raw inner markup of an AKN `<content>` block (which
 * normally holds one or more `<p>`s with inline markup — `<term>`, `<b>`, `<ref>`, etc.) as
 * an editable XML-fragment string. Not a rich-text surface — this is plain text editing of
 * the underlying markup, consistent with the structured-editor scope — but it's real access
 * to an element's actual body content, not just its `<num>`/`<heading>` labels.
 */
function RawContentField( app, getElement ) {
	this.app = app;
	this.getElement = getElement;
}

RawContentField.prototype.get = function () {
	var content = this.getElement( false );
	if ( !content ) {
		return '';
	}
	var serializer = new XMLSerializer();
	return Array.prototype.map.call( content.childNodes, function ( node ) {
		return node.nodeType === Node.TEXT_NODE ? node.textContent : serializer.serializeToString( node );
	} ).join( '' ).trim();
};

/** @throws {Error} If `text` isn't well-formed XML — caller must not treat the field as saved. */
RawContentField.prototype.set = function ( text ) {
	var app = this.app;
	var wrapped = '<content xmlns="' + AKN_NS + '">' + text + '</content>';
	var parsed = new DOMParser().parseFromString( wrapped, 'application/xml' );
	if ( parsed.getElementsByTagName( 'parsererror' ).length ) {
		throw new Error( 'invalid markup' );
	}
	var content = this.getElement( true );
	while ( content.firstChild ) {
		content.removeChild( content.firstChild );
	}
	Array.prototype.forEach.call( parsed.documentElement.childNodes, function ( node ) {
		content.appendChild( app.doc.importNode( node, true ) );
	} );
};
