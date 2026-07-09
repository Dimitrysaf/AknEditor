'use strict';

// The AKN namespace and the list of document-type roots are NOT defined here:
// they come from wgAknVocabulary, which AknRenderer derives from the schema
// (schema/akomantoso30.xsd — the single source of truth). Hardcoding them here
// is exactly the drift we must avoid; the string literal below is only a
// last-resort fallback for the (unexpected) case where the config is absent,
// kept equal to the schema's declared namespace (AknSchema::NS).
var AKN_VOCAB = mw.config.get( 'wgAknVocabulary' ) || {};
var AKN_NS = AKN_VOCAB.ns || 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0/WD17';
var ROOT_TYPES = AKN_VOCAB.documentTypes || [ 'act', 'bill', 'doc', 'officialGazette' ];

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
