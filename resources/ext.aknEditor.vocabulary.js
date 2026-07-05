'use strict';

var CONTAINER_TYPES = [ 'book', 'tome', 'part', 'title', 'subtitle', 'chapter',
	'subchapter', 'section', 'subsection', 'division', 'list' ];

var TITLED_TYPES = [ 'book', 'tome', 'part', 'title', 'subtitle', 'chapter', 'subchapter',
	'section', 'subsection', 'division', 'article', 'clause' ];

function formConfigFor( localName ) {
	return { content: CONTAINER_TYPES.indexOf( localName ) === -1 };
}

var INLINE_ATTR_BY_TAG = {
	term: 'refersTo',
	def: 'refersTo',
	entity: 'refersTo',
	organization: 'refersTo',
	person: 'refersTo',
	role: 'refersTo',
	location: 'refersTo',
	concept: 'refersTo',
	object: 'refersTo',
	quantity: 'unit'
};

var INLINE_ICON_BY_TAG = {
	term: 'tag',
	def: 'tag',
	entity: 'tag',
	organization: 'tag',
	person: 'tag',
	role: 'tag',
	location: 'tag',
	concept: 'tag',
	object: 'tag',
	quantity: 'tag',
	quotedText: 'quotes'
};

var INLINE_EXTRAS = [
	{ tag: 'b', icon: 'bold' },
	{ tag: 'i', icon: 'italic' },
	{ tag: 'u', icon: 'underline' },
	{ tag: 'sup', icon: 'superscript' },
	{ tag: 'sub', icon: 'subscript' },
	{ tag: 'date', attr: 'date', icon: 'calendar', inputType: 'date' },
	{ tag: 'ref', attr: 'href', icon: 'reference', picker: true },
	{ tag: 'rref', attr: 'href', icon: 'referenceExisting', picker: true },
	{ tag: 'mref', icon: 'reference' },
	{ tag: 'authorialNote', attr: 'marker', icon: 'reference', inputType: 'number' },
	{ tag: 'note', icon: 'flag' },
	{ tag: 'ins', icon: 'add' },
	{ tag: 'del', icon: 'trash' },
	{ tag: 'mod', icon: 'edit' }
];

var PRIMARY_INLINE_TAGS = [ 'b', 'i', 'u', 'term', 'date', 'ref' ];

function inlineEntry( tag, attr, icon, picker, inputType ) {
	var name = tag.toLowerCase();
	return { name: name, tag: tag, attr: attr, icon: icon, msgKey: 'aknedit-inline-' + name, picker: !!picker, inputType: inputType };
}

function buildInlineTagRegistry() {
	var vocab = mw.config.get( 'wgAknVocabulary' ) || {};
	var byName = {};

	INLINE_EXTRAS.forEach( function ( def ) {
		byName[ def.tag.toLowerCase() ] = inlineEntry( def.tag, def.attr, def.icon, def.picker, def.inputType );
	} );
	( vocab.inlineSpans || [] ).forEach( function ( tag ) {
		var name = tag.toLowerCase();
		if ( byName[ name ] ) {
			return;
		}
		byName[ name ] = inlineEntry( tag, INLINE_ATTR_BY_TAG[ tag ], INLINE_ICON_BY_TAG[ tag ] || 'tag' );
	} );

	var primary = [];
	var more = [];
	Object.keys( byName ).forEach( function ( name ) {
		( PRIMARY_INLINE_TAGS.indexOf( name ) !== -1 ? primary : more ).push( byName[ name ] );
	} );
	primary.sort( function ( a, b ) {
		return PRIMARY_INLINE_TAGS.indexOf( a.name ) - PRIMARY_INLINE_TAGS.indexOf( b.name );
	} );

	return { primary: primary, more: more, byName: byName };
}

var INLINE_TAG_REGISTRY = buildInlineTagRegistry();
var INLINE_TAG_BY_NAME = INLINE_TAG_REGISTRY.byName;
var INLINE_TAGS_PRIMARY = INLINE_TAG_REGISTRY.primary;
var INLINE_TAGS_MORE = INLINE_TAG_REGISTRY.more;

function headingLevel( localName ) {
	var vocab = mw.config.get( 'wgAknVocabulary' ) || {};
	return ( vocab.headingLevels && vocab.headingLevels[ localName ] ) || 6;
}

var HCONTAINER_LABELS = ( mw.config.get( 'wgAknVocabulary' ) || {} ).hcontainerLabels || {};
