'use strict';

var AKN_NS = 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0';
var ROOT_TYPES = [ 'act', 'bill', 'doc' ];

/** Hierarchical elements that hold nested structural children, never their own prose. */
var CONTAINER_TYPES = [ 'book', 'tome', 'part', 'title', 'subtitle', 'chapter',
	'subchapter', 'section', 'subsection', 'division', 'list' ];

/** Which of ElementPane's optional fields apply to a given structural element type. */
function formConfigFor( localName ) {
	return { content: CONTAINER_TYPES.indexOf( localName ) === -1 };
}

/**
 * @param {Element} parent
 * @param {string} localName
 * @return {Element|null} First direct child with this local name, or null.
 */
function firstChild( parent, localName ) {
	if ( !parent ) {
		return null;
	}
	for ( var i = 0; i < parent.children.length; i++ ) {
		if ( parent.children[ i ].localName === localName ) {
			return parent.children[ i ];
		}
	}
	return null;
}

/**
 * Mirrors AknDom::findRoot() server-side: the true document root is a
 * direct child of <akomaNtoso>, never a nested one (e.g. inside a
 * gazette's <component>).
 *
 * @param {XMLDocument} dom
 * @return {Element|null}
 */
function findRoot( dom ) {
	var akomaNtoso = dom.documentElement;
	if ( !akomaNtoso ) {
		return null;
	}
	for ( var i = 0; i < akomaNtoso.children.length; i++ ) {
		var child = akomaNtoso.children[ i ];
		if ( ROOT_TYPES.indexOf( child.localName ) !== -1 ) {
			return child;
		}
	}
	return null;
}

function elementTypeLabel( type ) {
	var msg = mw.message( 'aknedit-elementtype-' + type );
	return msg.exists() ? msg.text() : type;
}

function outlineLabel( el ) {
	return elementTypeLabel( el.localName );
}
