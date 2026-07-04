'use strict';

var CONTAINER_TYPES = [ 'book', 'tome', 'part', 'title', 'subtitle', 'chapter',
	'subchapter', 'section', 'subsection', 'division', 'list' ];

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

function structuralDescription( name ) {
	return 'Structural element <' + name + '>: added via the outline\'s Add dropdown ' +
		'(registerAddTools, ext.aknEditor.toolbar.js) as a child of the active element; ' +
		'edited via ElementPane (num/heading' + ( formConfigFor( name ).content ? '/content' : '' ) +
		' fields, plus generic attributes via renderAttributeTable). Heading level when ' +
		'rendered: h' + headingLevel( name ) + '.';
}

function inlineDescription( entry ) {
	if ( entry.picker ) {
		return 'Inline span <' + entry.tag + '>: wraps the current text selection with ' +
			'@href resolved from the RefDialog modal picker (registerRefTool, ' +
			'ext.aknEditor.toolbar.js / ext.aknEditor.dialogs.js), not a hand-typed placeholder.';
	}
	return 'Inline span <' + entry.tag + '>' + ( entry.attr ? ' (with an empty @' + entry.attr +
		' placeholder)' : '' ) + ': one-click wrap of the current text selection in the content ' +
		'field\'s mini-toolbar (wrapSelection, ext.aknEditor.toolbar.js).';
}

function buildAknConstructs() {
	var vocab = mw.config.get( 'wgAknVocabulary' ) || {};
	var constructs = {};

	( vocab.structureTypes || [] ).forEach( function ( name ) {
		constructs[ name ] = {
			category: 'structural',
			authored: true,
			description: structuralDescription( name )
		};
	} );

	INLINE_TAGS_PRIMARY.concat( INLINE_TAGS_MORE ).forEach( function ( entry ) {
		constructs[ entry.tag ] = {
			category: 'inline',
			authored: true,
			description: inlineDescription( entry )
		};
	} );

	constructs.hcontainer = {
		category: 'structural',
		authored: true,
		description: 'Titled block outside the fixed STRUCTURE_TYPES hierarchy, special-' +
			'cased into the outline walk (isOutlineElement, ext.aknEditor.app.js) alongside ' +
			'structureTypes. Added via the same Add dropdown as any structural type. @name ' +
			'matches HCONTAINER_LABELS for a canonical label (dedicated dropdown field in ' +
			'ElementPane), or @showAs for a free-form title (dedicated text field); optional ' +
			'own <heading> overrides both when rendered.'
	};
	constructs.classification = {
		category: 'meta',
		authored: true,
		description: '<meta><classification><keyword dictionary= value= showAs= href=>. ' +
			'@dictionary is a controlled-vocabulary URI (e.g. EuroVoc), @value the concept ' +
			'code within it, @href optionally scopes the keyword to one eId fragment instead ' +
			'of the whole document. Authored via the Metadata dialog\'s Classification page ' +
			'(renderElementListEditor, ext.aknEditor.app.js).'
	};
	constructs.lifecycle = {
		category: 'meta',
		authored: true,
		description: '<meta><lifecycle><eventRef eId= date= type= source=>. Dated events ' +
			'(enactment, amendment, repeal, ...); textualMod/force/period entries resolve ' +
			'their effective date against an eventRef\'s eId. Authored via the Metadata ' +
			'dialog\'s Lifecycle page (renderElementListEditor, ext.aknEditor.app.js).'
	};
	constructs.analysis = {
		category: 'meta',
		authored: true,
		description: '<meta><analysis><activeModifications|passiveModifications><textualMod ' +
			'type= source= destination= force=>. type is one of repeal/substitution/' +
			'insertion/replacement/renumbering/split/join. active = this document modifies ' +
			'another; passive = this document was modified by another. Authored via the ' +
			'Metadata dialog\'s Amendments page (renderElementListEditor with childAttr field ' +
			'kinds for source/destination/force, ext.aknEditor.app.js).'
	};
	constructs.quotedStructure = {
		category: 'structural',
		authored: true,
		description: 'Wraps a verbatim quoted excerpt of an amended provision (can nest a ' +
			'full structural subtree, e.g. a replacement <article>). Used together with ' +
			'<ins>/<del> to show exactly what changed, and <mod> for the amendment verb ' +
			'span (e.g. "is substituted"). Authored as an empty skeleton insert (SKELETON_TAGS, ' +
			'ext.aknEditor.toolbar.js) — the nested replacement structure itself is typed/' +
			'pasted in by hand, same raw-markup scope as content editing generally.'
	};
	constructs.officialGazette = {
		category: 'structural',
		authored: true,
		description: 'Root element for a Gazette issue — now in ROOT_TYPES (ext.aknEditor.dom.js) ' +
			'and detected via AknEditorApp#isGazette, which switches mount() to a dedicated, ' +
			'simpler workspace (buildGazetteWorkspace, ext.aknEditor.app.js): a documentRef ' +
			'list editor (href/showAs, fully editable) and a read-only component list ' +
			'(remove-only — a component\'s embedded document/meta/body is not deep-editable ' +
			'here). AknEditAction.php no longer refuses NS_GAZETTE.'
	};
	constructs.table = {
		category: 'structural',
		authored: true,
		description: '<table><caption>?<tr><th|td colspan= rowspan=>... Authored as a ' +
			'one-click skeleton insert (SKELETON_TAGS, ext.aknEditor.toolbar.js), not a ' +
			'structured rows/columns builder — still raw-markup editing after insertion.'
	};
	constructs.blockList = {
		category: 'structural',
		authored: true,
		description: '<blockList><listIntroduction>?<item num=?>...<listWrapUp>?. Authored ' +
			'as a one-click skeleton insert (SKELETON_TAGS, ext.aknEditor.toolbar.js).'
	};
	constructs.references = {
		category: 'meta',
		authored: true,
		description: '<meta><references><TLCOrganization|TLCPerson eId= href= showAs=>. ' +
			'Needed to resolve FRBRauthor@href and other #id hrefs. Authored via the ' +
			'Metadata dialog\'s References page (renderElementListEditor with a tagSelect ' +
			'column swapping TLCOrganization/TLCPerson); the identification page\'s Author ' +
			'dropdown is rebuilt from this list on every change (app.refreshMetaFields).'
	};
	constructs.FRBRExpression = {
		category: 'meta',
		authored: true,
		description: 'FRBRExpression/FRBRdate@date (expression date, distinct from the ' +
			'Work-level enactment date) and FRBRlanguage are both exposed in the Metadata ' +
			'dialog\'s Identification page, read/written via AknEditorApp#frbrChild.'
	};
	constructs.FRBRManifestation = {
		category: 'meta',
		authored: true,
		description: 'FRBRManifestation/FRBRuri@value exposed as a plain text field in the ' +
			'Metadata dialog\'s Identification page, via AknEditorApp#frbrChild.'
	};
	constructs.FRBRsubtype = {
		category: 'meta',
		authored: true,
		description: 'FRBRWork/FRBRsubtype@value — a second, distinct doctype-like field ' +
			'from root@name (which the Metadata dialog\'s "Document type" field already ' +
			'edits) — exposed as its own dropdown (same vocab.docTypes) in the ' +
			'Identification page.'
	};
	constructs.FRBRname = {
		category: 'meta',
		authored: true,
		description: 'FRBRWork/FRBRname@value — plain-text law citation (e.g. "ν. 5300/2026"). ' +
			'Exposed as a text field in the Metadata dialog\'s Identification page (still not ' +
			'read by MetaExtractor server-side, only stored/round-tripped).'
	};

	return constructs;
}

var AKN_CONSTRUCTS = buildAknConstructs();
