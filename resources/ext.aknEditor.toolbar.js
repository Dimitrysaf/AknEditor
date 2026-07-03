var TOOL_NAMES = [ 'add', 'remove', 'moveup', 'movedown', 'validate', 'metadata', 'showchanges', 'preview' ];

function apiErrorDetail( code, result ) {
	return result && result.error ? result.error.info : code;
}

/** A small OO.ui.Tool subclass factory — avoids repeating the same boilerplate 8 times. */
function registerTool( toolFactory, name, icon, msgKey, onSelect ) {
	function Tool() {
		Tool.super.apply( this, arguments );
	}
	OO.inheritClass( Tool, OO.ui.Tool );
	Tool.static.name = name;
	Tool.static.icon = icon;
	Tool.static.title = mw.msg( msgKey );
	Tool.prototype.onSelect = function () {
		onSelect();
		this.setActive( false );
	};
	Tool.prototype.onUpdateState = function () {};
	toolFactory.register( Tool );
}

/**
 * Inline AKN tags offered as one-click wraps in the content field's own mini-toolbar.
 * `tag` is the real element name to insert (case matters — `quotedText`, not `quotedtext`);
 * `name` is just the Tool registration key. `attr`, when set, adds an empty attribute
 * placeholder (`refersTo=""`, `date=""`, ...) for the user to fill in directly in the
 * textarea, consistent with this field already being raw-markup text editing.
 */
var INLINE_TAGS_PRIMARY = [
	{ name: 'b', tag: 'b', icon: 'bold', msgKey: 'aknedit-inline-b' },
	{ name: 'i', tag: 'i', icon: 'italic', msgKey: 'aknedit-inline-i' },
	{ name: 'u', tag: 'u', icon: 'underline', msgKey: 'aknedit-inline-u' },
	{ name: 'term', tag: 'term', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-term' },
	{ name: 'date', tag: 'date', attr: 'date', icon: 'calendar', msgKey: 'aknedit-inline-date' },
	{ name: 'ref', tag: 'ref', attr: 'href', icon: 'reference', msgKey: 'aknedit-inline-ref' }
];

/** The rest of AknVocabulary.INLINE_SPANS plus sup/sub/mref — reachable via the "more" list. */
var INLINE_TAGS_MORE = [
	{ name: 'sup', tag: 'sup', icon: 'superscript', msgKey: 'aknedit-inline-sup' },
	{ name: 'sub', tag: 'sub', icon: 'subscript', msgKey: 'aknedit-inline-sub' },
	{ name: 'mref', tag: 'mref', icon: 'reference', msgKey: 'aknedit-inline-mref' },
	{ name: 'def', tag: 'def', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-def' },
	{ name: 'entity', tag: 'entity', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-entity' },
	{ name: 'organization', tag: 'organization', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-organization' },
	{ name: 'person', tag: 'person', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-person' },
	{ name: 'role', tag: 'role', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-role' },
	{ name: 'location', tag: 'location', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-location' },
	{ name: 'quantity', tag: 'quantity', attr: 'unit', icon: 'tag', msgKey: 'aknedit-inline-quantity' },
	{ name: 'quotedtext', tag: 'quotedText', icon: 'quotes', msgKey: 'aknedit-inline-quotedtext' },
	{ name: 'concept', tag: 'concept', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-concept' },
	{ name: 'object', tag: 'object', attr: 'refersTo', icon: 'tag', msgKey: 'aknedit-inline-object' }
];

/** Wrap `input`'s current text selection in `<tag attr="">...</tag>`, then re-select it. */
function wrapSelection( input, tag, attr ) {
	var el = input.$input[ 0 ];
	var start = el.selectionStart;
	var end = el.selectionEnd;
	var value = el.value;
	var openTag = '<' + tag + ( attr ? ' ' + attr + '=""' : '' ) + '>';
	var closeTag = '</' + tag + '>';
	input.setValue( value.slice( 0, start ) + openTag + value.slice( start, end ) + closeTag + value.slice( end ) );
	el.focus();
	el.setSelectionRange( start + openTag.length, start + openTag.length + ( end - start ) );
}

/**
 * A small toolbar of inline-tag buttons for one content textarea, built the same way as the
 * main app toolbar (explicitly requested): a `bar` group for the common tags, and a `list`
 * group using OOUI's own `include: '*'` catch-all (documented on OO.ui.Toolbar#setup) for
 * the rest — no manual overflow handling needed.
 *
 * @param {OO.ui.MultilineTextInputWidget} contentInput
 * @return {jQuery}
 */
function buildInlineToolbar( contentInput ) {
	var toolFactory = new OO.ui.ToolFactory();
	var toolGroupFactory = new OO.ui.ToolGroupFactory();
	var toolbar = new OO.ui.Toolbar( toolFactory, toolGroupFactory );

	INLINE_TAGS_PRIMARY.concat( INLINE_TAGS_MORE ).forEach( function ( def ) {
		registerTool( toolFactory, def.name, def.icon, def.msgKey, function () {
			wrapSelection( contentInput, def.tag, def.attr );
		} );
	} );

	toolbar.setup( [
		{ name: 'primary', type: 'bar', include: INLINE_TAGS_PRIMARY.map( function ( def ) { return def.name; } ) },
		{ name: 'more', type: 'list', include: '*' }
	] );
	toolbar.initialize();

	return $( '<div>' ).addClass( 'akn-editor-inline-toolbar' ).append( toolbar.$element );
}

/** "Add" needs a type picker, so it gets a popup instead of a plain onSelect action. */
function registerAddTool( toolFactory, app ) {
	// PopupElement (mixed into OO.ui.PopupTool) only reads `config.popup`, passed at
	// construction time — there is no `static.popup`, so the popup config must be merged
	// in here, same as OOUI's own documented PopupTool subclassing example.
	function AddTool( toolGroup, config ) {
		AddTool.super.call( this, toolGroup, Object.assign( {
			popup: { padded: false, head: false }
		}, config ) );
		var tool = this;
		this.menu = new OO.ui.SelectWidget();
		( app.vocab.structureTypes || [] ).forEach( function ( type ) {
			tool.menu.addItems( [ new OO.ui.MenuOptionWidget( { data: type, label: type } ) ] );
		} );
		this.menu.on( 'choose', function ( item ) {
			app.addElement( item.getData() );
			tool.popup.toggle( false );
		} );
		this.popup.$body.append( this.menu.$element );
	}
	OO.inheritClass( AddTool, OO.ui.PopupTool );
	AddTool.static.name = 'add';
	AddTool.static.icon = 'add';
	AddTool.static.title = mw.msg( 'aknedit-tool-add' );
	toolFactory.register( AddTool );
}
