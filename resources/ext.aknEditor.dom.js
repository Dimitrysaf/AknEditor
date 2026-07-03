'use strict';

var AKN_NS = 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0';
var ROOT_TYPES = [ 'act', 'bill', 'doc' ];

/** Hierarchical elements that hold nested structural children, never their own prose. */
var CONTAINER_TYPES = [ 'book', 'tome', 'part', 'title', 'subtitle', 'chapter',
	'subchapter', 'section', 'subsection', 'division', 'list' ];

/** Which of ElementDialog's optional fields apply to a given structural element type. */
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

/** Label an outline item from its <num>/<heading>, falling back to the tag name. */
function outlineLabel( el ) {
	var num = firstChild( el, 'num' );
	var heading = firstChild( el, 'heading' );
	var label = [ num ? num.textContent : '', heading ? heading.textContent : '' ]
		.join( ' ' )
		.trim();
	return label !== '' ? label : el.localName;
}
