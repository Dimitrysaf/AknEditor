function apiErrorDetail( code, result ) {
	return result && result.error ? result.error.info : code;
}

/** A small OO.ui.Tool subclass factory — avoids repeating the same boilerplate 8 times. */
function registerTool( toolFactory, name, icon, msgKey, onSelect, displayBothIconAndLabel ) {
	function Tool() {
		Tool.super.apply( this, arguments );
	}
	OO.inheritClass( Tool, OO.ui.Tool );
	Tool.static.name = name;
	Tool.static.icon = icon;
	Tool.static.title = mw.msg( msgKey );
	Tool.static.displayBothIconAndLabel = !!displayBothIconAndLabel;
	Tool.prototype.onSelect = function () {
		onSelect();
		this.setActive( false );
	};
	Tool.prototype.onUpdateState = function () {};
	toolFactory.register( Tool );
}

function registerHistoryTools( toolFactory, app ) {
	function UndoTool() {
		UndoTool.super.apply( this, arguments );
	}
	OO.inheritClass( UndoTool, OO.ui.Tool );
	UndoTool.static.name = 'undo';
	UndoTool.static.icon = 'undo';
	UndoTool.static.title = mw.msg( 'aknedit-tool-undo' );
	UndoTool.prototype.onSelect = function () {
		app.undo();
		this.setActive( false );
	};
	UndoTool.prototype.onUpdateState = function () {
		this.setDisabled( !app.canUndo() );
	};
	toolFactory.register( UndoTool );

	function RedoTool() {
		RedoTool.super.apply( this, arguments );
	}
	OO.inheritClass( RedoTool, OO.ui.Tool );
	RedoTool.static.name = 'redo';
	RedoTool.static.icon = 'redo';
	RedoTool.static.title = mw.msg( 'aknedit-tool-redo' );
	RedoTool.prototype.onSelect = function () {
		app.redo();
		this.setActive( false );
	};
	RedoTool.prototype.onUpdateState = function () {
		this.setDisabled( !app.canRedo() );
	};
	toolFactory.register( RedoTool );
}

/** Wrap the `[start,end)` range of `input`'s text in `<tag attr="attrValue">...</tag>`. */
function wrapRange( input, start, end, tag, attr, attrValue ) {
	var el = input.$input[ 0 ];
	var value = el.value;
	var openTag = '<' + tag + ( attr ? ' ' + attr + '="' + ( attrValue || '' ) + '"' : '' ) + '>';
	var closeTag = '</' + tag + '>';
	input.setValue( value.slice( 0, start ) + openTag + value.slice( start, end ) + closeTag + value.slice( end ) );
	el.focus();
	el.setSelectionRange( start + openTag.length, start + openTag.length + ( end - start ) );
}

/** Wrap `input`'s current text selection in `<tag attr="">...</tag>`, then re-select it. */
function wrapSelection( input, tag, attr ) {
	var el = input.$input[ 0 ];
	wrapRange( input, el.selectionStart, el.selectionEnd, tag, attr );
}

/** Replace `input`'s current selection (or insert at the cursor) with a fixed block of XML. */
function insertSkeleton( input, xml ) {
	var el = input.$input[ 0 ];
	var start = el.selectionStart;
	var end = el.selectionEnd;
	var value = el.value;
	input.setValue( value.slice( 0, start ) + xml + value.slice( end ) );
	el.focus();
	el.setSelectionRange( start + xml.length, start + xml.length );
}

/**
 * Block-level skeletons offered as one-click inserts (not selection-wraps — there's
 * usually no existing text to wrap for a brand new table/list/quoted structure).
 */
var SKELETON_TAGS = [
	{
		name: 'table',
		icon: 'table',
		msgKey: 'aknedit-inline-table',
		xml: '<table><tr><th></th><th></th></tr><tr><td></td><td></td></tr></table>'
	},
	{
		name: 'blocklist',
		icon: 'listBullet',
		msgKey: 'aknedit-inline-blocklist',
		xml: '<blockList><item><num></num></item><item><num></num></item></blockList>'
	},
	{
		name: 'quotedstructure',
		icon: 'quotes',
		msgKey: 'aknedit-inline-quotedstructure',
		xml: '<quotedStructure></quotedStructure>'
	}
];

/**
 * A ref/rref tool that resolves its `href` from a popup picker of the document's own local
 * eIds (`app.structureEls`), instead of leaving the attribute for the user to hand-type.
 * Same `OO.ui.PopupTool` construction pattern as the "Add" tool (registerAddTools).
 */
function registerRefTool( toolFactory, app, contentInput, def ) {
	function RefTool( toolGroup, config ) {
		RefTool.super.call( this, toolGroup, Object.assign( {
			popup: { padded: false, head: false }
		}, config ) );
		this.contentInput = contentInput;
		this.capturedStart = 0;
		this.capturedEnd = 0;

		var tool = this;
		this.menu = new OO.ui.SelectWidget();
		app.structureEls.forEach( function ( el ) {
			var eId = el.getAttribute( 'eId' );
			if ( !eId ) {
				return;
			}
			tool.menu.addItems( [ new OO.ui.MenuOptionWidget( { data: eId, label: outlineLabel( el ) + ' (' + eId + ')' } ) ] );
		} );
		this.menu.on( 'choose', function ( item ) {
			wrapRange( contentInput, tool.capturedStart, tool.capturedEnd, def.tag, def.attr, '#' + item.getData() );
			tool.popup.toggle( false );
		} );
		this.popup.$body.append( this.menu.$element );
	}
	OO.inheritClass( RefTool, OO.ui.PopupTool );
	RefTool.static.name = def.name;
	RefTool.static.icon = def.icon;
	RefTool.static.title = mw.msg( def.msgKey );
	RefTool.prototype.onPopupToggle = function ( isVisible ) {
		OO.ui.PopupTool.prototype.onPopupToggle.call( this, isVisible );
		if ( isVisible ) {
			this.capturedStart = this.contentInput.$input[ 0 ].selectionStart;
			this.capturedEnd = this.contentInput.$input[ 0 ].selectionEnd;
		}
	};
	toolFactory.register( RefTool );
}

/**
 * A small toolbar of inline-tag buttons for one content textarea, built the same way as the
 * main app toolbar (explicitly requested): a `bar` group for the common tags, and a `list`
 * group using OOUI's own `include: '*'` catch-all (documented on OO.ui.Toolbar#setup) for
 * the rest — no manual overflow handling needed.
 *
 * @param {AknEditorApp} app
 * @param {OO.ui.MultilineTextInputWidget} contentInput
 * @return {jQuery}
 */
function buildInlineToolbar( app, contentInput ) {
	var toolFactory = new OO.ui.ToolFactory();
	var toolGroupFactory = new OO.ui.ToolGroupFactory();
	var toolbar = new OO.ui.Toolbar( toolFactory, toolGroupFactory );

	INLINE_TAGS_PRIMARY.concat( INLINE_TAGS_MORE ).forEach( function ( def ) {
		if ( def.picker ) {
			registerRefTool( toolFactory, app, contentInput, def );
			return;
		}
		registerTool( toolFactory, def.name, def.icon, def.msgKey, function () {
			wrapSelection( contentInput, def.tag, def.attr );
		} );
	} );

	SKELETON_TAGS.forEach( function ( def ) {
		registerTool( toolFactory, def.name, def.icon, def.msgKey, function () {
			insertSkeleton( contentInput, def.xml );
		} );
	} );

	toolbar.setup( [
		{ name: 'primary', type: 'bar', include: INLINE_TAGS_PRIMARY.map( function ( def ) { return def.name; } ) },
		{ name: 'more', type: 'list', include: '*' }
	] );
	toolbar.initialize();

	return $( '<div>' ).addClass( 'akn-editor-inline-toolbar' ).append( toolbar.$element );
}

function registerAddTools( toolFactory, app ) {
	var names = [];
	( app.vocab.structureTypes || [] ).concat( [ 'hcontainer' ] ).forEach( function ( type ) {
		var name = 'add-' + type;
		names.push( name );

		function AddTypeTool() {
			AddTypeTool.super.apply( this, arguments );
		}
		OO.inheritClass( AddTypeTool, OO.ui.Tool );
		AddTypeTool.static.name = name;
		AddTypeTool.static.title = elementTypeLabel( type );
		AddTypeTool.prototype.onSelect = function () {
			app.addElement( type );
			this.setActive( false );
		};
		AddTypeTool.prototype.onUpdateState = function () {};
		toolFactory.register( AddTypeTool );
	} );
	return names;
}

/**
 * The drag-handle icon (Codex's `cdxIconDraggable` — up/down arrows only, since rows here
 * only ever reorder vertically among siblings; NOT `cdxIconDraggableXY`, the 4-direction
 * variant). Inlined as raw SVG since it isn't part of any OOUI icon pack. The vendored
 * resources/lib/codex-icons/codex-icons.json in this tree predates Codex's split of this
 * icon into `cdxIconDraggable`/`cdxIconDraggableHorizontal`/`cdxIconDraggableXY` — its
 * "cdxIconDraggable" entry is actually today's `cdxIconDraggableXY`. This path is instead
 * verified against the current upstream source, packages/codex-icons/src/images/draggable.svg
 * in https://github.com/wikimedia/design-codex.
 *
 * @return {jQuery}
 */
function buildDraggableIcon() {
	return $(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true">' +
			'<path d="m13 16.5-3 3-3-3V16h6zm5-3.5H2v-2h16zm0-4H2V7h16zm-5-5.5V4H7v-.5l3-3z"></path>' +
		'</svg>'
	);
}

/**
 * One row of the structure outline: a divider-separated line with a drag handle at the edge
 * and a label, replacing the previous OO.ui.OutlineOptionWidget rows per explicit feedback.
 * The drag handle is OOUI's own documented mechanism for restricting a draggable item's grab
 * area (verified against resources/lib/ooui/oojs-ui-widgets.js: `OO.ui.mixin.DraggableElement`'s
 * `config.$handle`, "the part of the element which can be used for dragging" — grabbing
 * anywhere else on the row still just clicks it, `wasHandleUsed` gates whether a real drag
 * is allowed to start).
 *
 * @param {Element} el The structural element this row represents.
 * @param {string} label
 * @param {number} level Nesting depth, for indentation.
 */
function OutlineRow( el, label, level, hasChildren, collapsed ) {
	OutlineRow.super.call( this );

	this.el = el;

	this.collapseButton = new OO.ui.ButtonWidget( {
		icon: 'downTriangle',
		label: mw.msg( collapsed ? 'aknedit-outline-expand' : 'aknedit-outline-collapse' ),
		invisibleLabel: true,
		framed: false,
		classes: [ 'akn-editor-outline-row-collapse' ]
	} );
	if ( hasChildren ) {
		this.collapseButton.on( 'click', function () {
			this.emit( 'togglecollapse' );
		}.bind( this ) );
	} else {
		this.collapseButton.$element.addClass( 'akn-editor-outline-row-collapse-empty' );
	}
	this.collapseButton.$element.toggleClass( 'akn-editor-outline-row-collapse-collapsed', !!collapsed );

	this.$handle = $( '<span>' ).addClass( 'akn-editor-outline-row-handle' ).append( buildDraggableIcon() );
	this.$label = $( '<span>' ).addClass( 'akn-editor-outline-row-label' ).text( label );

	OO.ui.mixin.DraggableElement.call( this, { $handle: this.$handle } );

	this.$element
		.addClass( 'akn-editor-outline-row' )
		.data( 'aknOutlineRow', this )
		.css( 'paddingInlineStart', ( level * 0.9 ) + 'em' )
		.append( this.collapseButton.$element, this.$label, this.$handle )
		.on( 'click', this.onClick.bind( this ) );
}
OO.inheritClass( OutlineRow, OO.ui.Widget );
OO.mixinClass( OutlineRow, OO.ui.mixin.DraggableElement );

/** @fires select */
OutlineRow.prototype.onClick = function ( e ) {
	// The handle has its own job (dragging) — clicking it shouldn't also select the row.
	if ( OO.ui.contains( this.$handle[ 0 ], e.target, true ) ) {
		return;
	}
	this.emit( 'select' );
};

OutlineRow.prototype.setLabel = function ( label ) {
	this.$label.text( label );
};

OutlineRow.prototype.setActive = function ( active ) {
	this.$element.toggleClass( 'akn-editor-outline-row-active', active );
};

/**
 * The outline's container, reordering rows by drag-and-drop via OOUI's own
 * DraggableGroupElement — the same mixin OO.ui.TagMultiselectWidget uses for its own
 * reorderable tags (resources/lib/ooui/oojs-ui-widgets.js).
 *
 * @param {Object} [config]
 */
function OutlineGroup( config ) {
	OutlineGroup.super.call( this, config );
	// GroupElement defaults `$group` (where item.$element actually gets appended) to a new,
	// detached <div> unless told otherwise — pointing it at our own $element is the same
	// thing OO.ui.SelectWidget itself does, and what DraggableGroupElement's own dragover
	// handling needs, since it queries `this.$group.children()` to find row neighbours.
	config = Object.assign( { $group: this.$element }, config );
	OO.ui.mixin.GroupWidget.call( this, config );
	OO.ui.mixin.DraggableGroupElement.call( this, config );
	this.$element.addClass( 'akn-editor-outline-group' );
}
OO.inheritClass( OutlineGroup, OO.ui.Widget );
OO.mixinClass( OutlineGroup, OO.ui.mixin.GroupWidget );
OO.mixinClass( OutlineGroup, OO.ui.mixin.DraggableGroupElement );
