'use strict';

var AKN_NS = 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0';
var ROOT_TYPES = [ 'act', 'bill', 'doc', 'officialGazette' ];

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
	if ( el.localName === 'hcontainer' ) {
		var hname = el.getAttribute( 'name' );
		if ( hname && HCONTAINER_LABELS[ hname ] ) {
			return HCONTAINER_LABELS[ hname ];
		}
		var showAs = el.getAttribute( 'showAs' );
		if ( showAs ) {
			return showAs;
		}
	}
	return elementTypeLabel( el.localName );
}
