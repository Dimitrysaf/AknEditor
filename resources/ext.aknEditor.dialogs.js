/**
 * The one save-flow dialog — save / review changes / preview, as panels in a StackLayout
 * switched via `swapPanel()`, matching VE's real ve.ui.MWSaveDialog (verified against
 * modules/ve-mw/ui/dialogs/ve.ui.MWSaveDialog.js: one ProcessDialog, `this.panels =
 * new OO.ui.StackLayout(...)`, `swapPanel(name)`), rather than three separate dialogs.
 * Action visibility per panel uses OOUI's own mode mechanism (`static.actions[].modes` +
 * `this.actions.setMode()`), the same pattern documented on OO.ui.ActionSet itself.
 */
function SaveDialog( config ) {
	SaveDialog.super.call( this, config );
}
OO.inheritClass( SaveDialog, OO.ui.ProcessDialog );
SaveDialog.static.name = 'aknEditorSaveDialog';
SaveDialog.static.title = mw.msg( 'aknedit-save-dialog-title' );
SaveDialog.static.size = 'larger';
SaveDialog.static.actions = [
	{ action: 'save', modes: 'save', label: mw.msg( 'aknedit-save-confirm' ), flags: [ 'primary', 'progressive' ] },
	{ modes: 'save', label: mw.msg( 'aknedit-cancel' ), flags: 'safe' },
	// Mirrors ve.ui.MWSaveDialog.static.actions: 'review'/'preview' are actions on this same
	// dialog (visible only in 'save' mode), not separate toolbar tools that jump straight in.
	{ action: 'review', modes: 'save', label: mw.msg( 'aknedit-save-review' ) },
	{ action: 'preview', modes: 'save', label: mw.msg( 'aknedit-save-preview' ) },
	{ action: 'back', modes: [ 'review', 'preview' ], label: mw.msg( 'aknedit-save-back' ), flags: [ 'safe', 'back' ] }
];

SaveDialog.prototype.initialize = function () {
	SaveDialog.super.prototype.initialize.call( this );

	this.summaryInput = new OO.ui.TextInputWidget();
	this.savePanel = new OO.ui.PanelLayout( { padded: true, expanded: false } );
	this.savePanel.$element.append(
		new OO.ui.FieldLayout( this.summaryInput, {
			label: mw.msg( 'aknedit-save-summary-label' ),
			align: 'top'
		} ).$element
	);

	this.$reviewContent = $( '<div>' ).addClass( 'akn-editor-dialog-content' );
	this.reviewPanel = new OO.ui.PanelLayout( { padded: true, expanded: false, scrollable: true } );
	this.reviewPanel.$element.append( this.$reviewContent );

	this.$previewContent = $( '<div>' ).addClass( 'akn-editor-dialog-content' );
	this.previewPanel = new OO.ui.PanelLayout( { padded: true, expanded: false, scrollable: true } );
	this.previewPanel.$element.append( this.$previewContent );

	this.panels = new OO.ui.StackLayout( { items: [ this.savePanel, this.reviewPanel, this.previewPanel ] } );
	this.$body.append( this.panels.$element );
};

/** @param {string} panel One of 'save', 'review', 'preview'. */
SaveDialog.prototype.swapPanel = function ( panel ) {
	this.panels.setItem( this[ panel + 'Panel' ] );
	this.actions.setMode( panel );
};

SaveDialog.prototype.setReviewContent = function ( $html ) {
	this.$reviewContent.empty().append( $html );
};

SaveDialog.prototype.setPreviewContent = function ( $html ) {
	this.$previewContent.empty().append( $html );
};

SaveDialog.prototype.getSetupProcess = function ( data ) {
	var dialog = this;
	data = data || {};
	return SaveDialog.super.prototype.getSetupProcess.call( this, data ).next( function () {
		dialog.swapPanel( data.initialPanel || 'save' );
	} );
};

SaveDialog.prototype.getBodyHeight = function () {
	return this.panels.getCurrentItem().$element.outerHeight( true ) || 300;
};

/**
 * @param {string} action
 * @return {OO.ui.Process}
 */
SaveDialog.prototype.getActionProcess = function ( action ) {
	var dialog = this;
	if ( action === 'save' ) {
		// Matches ve.ui.MWSaveDialog's own 'save' action: emit 'save' with a deferred and
		// return its promise, so OOUI's own process-pending spinner covers the dialog while
		// the caller's API request is in flight, and a rejection surfaces as the dialog's
		// built-in recoverable error panel instead of a separate alert().
		return new OO.ui.Process( function () {
			var deferred = $.Deferred();
			dialog.emit( 'save', dialog.summaryInput.getValue(), deferred );
			return deferred.promise();
		} );
	}
	if ( action === 'review' || action === 'preview' ) {
		return new OO.ui.Process( function () {
			dialog.emit( action );
		} );
	}
	if ( action === 'back' ) {
		return new OO.ui.Process( function () {
			dialog.swapPanel( 'save' );
		} );
	}
	return SaveDialog.super.prototype.getActionProcess.call( this, action );
};

/**
 * One page of the metadata dialog's outline. Mirrors OOUI's own documented PageLayout
 * subclassing pattern, the same one VE's real metadata pages use (verified against
 * modules/ve-mw/ui/pages/ve.ui.MWCategoriesPage.js and friends: a plain OO.ui.PageLayout
 * subclass whose `setupOutlineItem` sets the outline row's label).
 *
 * @param {string} name
 * @param {string} title
 */
function MetaPage( name, title ) {
	MetaPage.super.call( this, name, { scrollable: true } );
	this.title = title;
}
OO.inheritClass( MetaPage, OO.ui.PageLayout );

MetaPage.prototype.setupOutlineItem = function () {
	this.outlineItem.setLabel( this.title );
};

MetaPage.prototype.setFields = function ( fields ) {
	this.$element.empty().append( new OO.ui.FieldsetLayout( { items: fields } ).$element );
};

MetaPage.prototype.setContent = function ( $content ) {
	this.$element.empty().append( $content );
};

/**
 * Metadata form, moved into a dialog so the outline can span the full width. Structured as an
 * outlined OO.ui.BookletLayout — matching VE's real ve.ui.MWMetaDialog (verified against
 * modules/ve-mw/ui/dialogs/ve.ui.MWMetaDialog.js: `this.bookletLayout = new
 * OO.ui.BookletLayout( { outlined: true } )`, pages added via `addPages`) — instead of one
 * long flat form, since AknEditor's metadata splits cleanly into identification vs. gazette
 * publication fields.
 */
function MetadataDialog( config ) {
	MetadataDialog.super.call( this, config );
}
OO.inheritClass( MetadataDialog, OO.ui.ProcessDialog );
MetadataDialog.static.name = 'aknEditorMetadataDialog';
MetadataDialog.static.title = mw.msg( 'aknedit-metadata-heading' );
MetadataDialog.static.size = 'large';
MetadataDialog.static.actions = [
	{ label: mw.msg( 'aknedit-cancel' ), flags: 'safe' }
];

MetadataDialog.prototype.initialize = function () {
	MetadataDialog.super.prototype.initialize.call( this );
	this.identificationPage = new MetaPage( 'identification', mw.msg( 'aknedit-metadata-page-identification' ) );
	this.publicationPage = new MetaPage( 'publication', mw.msg( 'aknedit-metadata-page-publication' ) );
	this.referencesPage = new MetaPage( 'references', mw.msg( 'aknedit-metadata-page-references' ) );
	this.classificationPage = new MetaPage( 'classification', mw.msg( 'aknedit-metadata-page-classification' ) );
	this.lifecyclePage = new MetaPage( 'lifecycle', mw.msg( 'aknedit-metadata-page-lifecycle' ) );
	this.amendmentsPage = new MetaPage( 'amendments', mw.msg( 'aknedit-metadata-page-amendments' ) );
	this.bookletLayout = new OO.ui.BookletLayout( { outlined: true } );
	this.bookletLayout.addPages( [
		this.identificationPage,
		this.publicationPage,
		this.referencesPage,
		this.classificationPage,
		this.lifecyclePage,
		this.amendmentsPage
	] );
	this.$body.append( this.bookletLayout.$element );
	this.bookletLayout.on( 'set', this.updateSize.bind( this ) );
};

/**
 * @param {OO.ui.FieldLayout[]} identificationFields
 * @param {OO.ui.FieldLayout[]} publicationFields
 */
MetadataDialog.prototype.setFields = function ( identificationFields, publicationFields ) {
	this.identificationPage.setFields( identificationFields );
	this.publicationPage.setFields( publicationFields );
};

MetadataDialog.prototype.getSetupProcess = function ( data ) {
	return MetadataDialog.super.prototype.getSetupProcess.call( this, data ).next( function () {
		this.bookletLayout.setPage( 'identification' );
	}, this );
};

MetadataDialog.prototype.getBodyHeight = function () {
	var page = this.bookletLayout.stackLayout.getCurrentItem();
	var pageHeight = page ? page.$element.outerHeight( true ) : 0;
	// Never shrink to fit a short page (e.g. Classification with only a couple of rows) —
	// only grow past this floor for a page with genuinely more content than it fits.
	return Math.max( pageHeight, 500 );
};

/**
 * The ref/rref cross-reference picker, a real modal (opened by registerRefTool,
 * ext.aknEditor.toolbar.js) rather than a toolbar popup — search-then-select is too much
 * task for a cramped popup. One shared instance for the whole app; `getSetupProcess`'s
 * `data` carries which content field and tag/attr this particular open is for.
 *
 * Two ways to resolve a target: the current document's own local eIds (instant, no API
 * call), or another document via AknRenderer's `action=aknreference` API — first `op=search`
 * to find the document, then `op=eids` to list its structure, reusing the FRBR Work URI /
 * structure index AknRenderer already maintains instead of the editor re-deriving hrefs.
 */
function RefDialog( config ) {
	RefDialog.super.call( this, config );
}
OO.inheritClass( RefDialog, OO.ui.ProcessDialog );
RefDialog.static.name = 'aknEditorRefDialog';
RefDialog.static.size = 'medium';
RefDialog.static.actions = [
	{ label: mw.msg( 'aknedit-cancel' ), flags: 'safe' }
];

RefDialog.prototype.initialize = function () {
	RefDialog.super.prototype.initialize.call( this );
	var dialog = this;

	this.localHeading = $( '<div>' ).addClass( 'akn-editor-ref-picker-heading' ).text( mw.msg( 'aknedit-ref-local-heading' ) );
	this.localMenu = new OO.ui.SelectWidget();
	this.localMenu.on( 'choose', function ( item ) {
		dialog.commit( '#' + item.getData() );
	} );

	this.searchInput = new OO.ui.SearchInputWidget( { placeholder: mw.msg( 'aknedit-ref-search-placeholder' ) } );
	this.searchInput.on( 'change', mw.util.debounce( function ( query ) {
		dialog.doSearch( query );
	}, 250 ) );

	this.docMenu = new OO.ui.SelectWidget();
	this.docMenu.on( 'choose', function ( item ) {
		dialog.chooseDoc( item.getData() );
	} );

	this.backButton = new OO.ui.ButtonWidget( {
		label: mw.msg( 'aknedit-ref-back' ),
		framed: false,
		icon: 'previous',
		classes: [ 'akn-editor-ref-picker-back' ]
	} );
	this.backButton.on( 'click', this.showSearch.bind( this ) );

	this.eidMenu = new OO.ui.SelectWidget();
	// .off() first: choosing a document twice without ever picking an eId would otherwise
	// stack a stale listener holding the previous match, double-committing.
	this.eidMenu.on( 'choose', function ( item ) {
		dialog.commit( dialog.chosenMatch.workUri + ( item.getData() ? '#' + item.getData() : '' ) );
	} );

	this.panel = new OO.ui.PanelLayout( { padded: true, expanded: false, scrollable: true } );
	this.panel.$element.append(
		this.localHeading, this.localMenu.$element,
		this.searchInput.$element, this.docMenu.$element,
		this.backButton.$element, this.eidMenu.$element
	);
	this.$body.append( this.panel.$element );
	this.showSearch();
};

RefDialog.prototype.showSearch = function () {
	this.backButton.toggle( false );
	this.eidMenu.toggle( false ).clearItems();
	this.searchInput.toggle( true );
	this.docMenu.toggle( true );
};

RefDialog.prototype.doSearch = function ( query ) {
	var dialog = this;
	this.docMenu.clearItems();
	if ( !query ) {
		return;
	}
	new mw.Api().get( { action: 'aknreference', op: 'search', query: query, formatversion: 2 } ).done( function ( result ) {
		dialog.docMenu.clearItems();
		( result.matches || [] ).forEach( function ( match ) {
			dialog.docMenu.addItems( [ new OO.ui.MenuOptionWidget( {
				data: match,
				label: match.alias ? match.title + ' — ' + match.alias : match.title
			} ) ] );
		} );
	} );
};

RefDialog.prototype.chooseDoc = function ( match ) {
	var dialog = this;
	this.chosenMatch = match;
	this.searchInput.toggle( false );
	this.docMenu.toggle( false );
	this.backButton.toggle( true );
	this.eidMenu.toggle( true ).clearItems();
	this.eidMenu.addItems( [ new OO.ui.MenuOptionWidget( { data: '', label: mw.msg( 'aknedit-ref-fragment-whole' ) } ) ] );
	new mw.Api().get( { action: 'aknreference', op: 'eids', pageid: match.pageid, formatversion: 2 } ).done( function ( result ) {
		( result.eids || [] ).forEach( function ( row ) {
			var label = ( row.num ? row.num + ' ' : '' ) + ( row.heading || row.eid );
			dialog.eidMenu.addItems( [ new OO.ui.MenuOptionWidget( { data: row.eid, label: label + ' (' + row.eid + ')' } ) ] );
		} );
	} );
};

RefDialog.prototype.commit = function ( href ) {
	if ( this.target.mode === 'xml' ) {
		wrapRange( this.target.input, this.capturedStart, this.capturedEnd, this.def.tag, this.def.attr, href );
	} else if ( this.capturedRange ) {
		var el = wrapRichRange( this.capturedRange, this.def.tag, this.def.attr );
		richtextSetAttr( el, this.def.attr, href );
	}
	this.close();
};

RefDialog.prototype.getSetupProcess = function ( data ) {
	return RefDialog.super.prototype.getSetupProcess.call( this, data ).next( function () {
		this.target = data.target;
		this.def = data.def;
		this.capturedStart = data.capturedStart;
		this.capturedEnd = data.capturedEnd;
		this.capturedRange = data.capturedRange;
		this.chosenMatch = null;
		this.title.setLabel( mw.msg( data.def.msgKey ) );

		this.searchInput.setValue( '' );
		this.docMenu.clearItems();
		this.showSearch();

		this.localMenu.clearItems();
		var localMenu = this.localMenu;
		data.app.structureEls.forEach( function ( el ) {
			var eId = el.getAttribute( 'eId' );
			if ( !eId ) {
				return;
			}
			localMenu.addItems( [ new OO.ui.MenuOptionWidget( { data: eId, label: outlineLabel( el ) + ' (' + eId + ')' } ) ] );
		} );
	}, this );
};

RefDialog.prototype.getBodyHeight = function () {
	return Math.max( this.panel.$element.outerHeight( true ) || 0, 400 );
};

function calendarAdapter() {
	var calendar = new mw.widgets.CalendarWidget();
	return {
		$element: calendar.$element,
		getValue: function () {
			return calendar.getDate() || '';
		},
		setValue: function ( value ) {
			calendar.setDate( value || null );
		},
		focus: function () {
			calendar.$element.trigger( 'focus' );
		}
	};
}

var ATTRVALUE_WIDGET_FACTORIES = {
	date: calendarAdapter,
	number: function () {
		return new OO.ui.NumberInputWidget();
	}
};

function attrValueWidgetFor( inputType ) {
	return ( ATTRVALUE_WIDGET_FACTORIES[ inputType ] || function () {
		return new OO.ui.TextInputWidget();
	} )();
}

function AttrValueDialog( config ) {
	AttrValueDialog.super.call( this, config );
}
OO.inheritClass( AttrValueDialog, OO.ui.ProcessDialog );
AttrValueDialog.static.name = 'aknEditorAttrValueDialog';
AttrValueDialog.static.size = 'medium';
AttrValueDialog.static.actions = [
	{ action: 'done', label: mw.msg( 'aknedit-attrvalue-done' ), flags: [ 'primary', 'progressive' ] },
	{ label: mw.msg( 'aknedit-cancel' ), flags: 'safe' }
];

AttrValueDialog.prototype.initialize = function () {
	AttrValueDialog.super.prototype.initialize.call( this );
	this.$fieldContainer = $( '<div>' );
	this.$body.append( this.$fieldContainer );
};

AttrValueDialog.prototype.getSetupProcess = function ( data ) {
	return AttrValueDialog.super.prototype.getSetupProcess.call( this, data ).next( function () {
		this.onDone = data.onDone;
		this.input = attrValueWidgetFor( data.inputType );
		this.input.setValue( data.initialValue || '' );
		this.field = new OO.ui.FieldLayout( this.input, { align: 'top', label: mw.msg( data.msgKey ) } );
		this.$fieldContainer.empty().append( this.field.$element );
	}, this );
};

AttrValueDialog.prototype.getReadyProcess = function ( data ) {
	return AttrValueDialog.super.prototype.getReadyProcess.call( this, data ).next( function () {
		this.input.focus();
	}, this );
};

AttrValueDialog.prototype.getActionProcess = function ( action ) {
	if ( action === 'done' ) {
		return new OO.ui.Process( function () {
			this.onDone( this.input.getValue() );
			this.close();
		}, this );
	}
	return AttrValueDialog.super.prototype.getActionProcess.call( this, action );
};

AttrValueDialog.prototype.getBodyHeight = function () {
	return Math.max( this.field.$element.outerHeight( true ) || 0, 150 );
};

/**
 * Per-element editor, shown as a side pane next to the outline when a row is selected — a
 * split workspace (outline | element pane) instead of a floating modal, per explicit
 * feedback. Wraps the same attribute-table and num/heading field logic the old ElementDialog
 * modal used, unchanged; only the window chrome (ProcessDialog → plain Widget + close button)
 * is different.
 *
 * @param {AknEditorApp} app
 */
function ElementPane( app ) {
	ElementPane.super.call( this );
	this.app = app;

	this.$heading = $( '<h3>' ).addClass( 'akn-editor-element-pane-title' );

	this.moveUpButton = new OO.ui.ButtonWidget( {
		icon: 'arrowUp',
		label: mw.msg( 'aknedit-tool-moveup' ),
		invisibleLabel: true,
		framed: false
	} );
	this.moveUpButton.on( 'click', function () { app.moveSelected( -1 ); } );

	this.moveDownButton = new OO.ui.ButtonWidget( {
		icon: 'arrowDown',
		label: mw.msg( 'aknedit-tool-movedown' ),
		invisibleLabel: true,
		framed: false
	} );
	this.moveDownButton.on( 'click', function () { app.moveSelected( 1 ); } );

	this.removeButton = new OO.ui.ButtonWidget( {
		icon: 'trash',
		label: mw.msg( 'aknedit-tool-remove' ),
		invisibleLabel: true,
		framed: false,
		flags: [ 'destructive' ]
	} );
	this.removeButton.on( 'click', function () { app.removeSelected(); } );

	this.closeButton = new OO.ui.ButtonWidget( {
		icon: 'close',
		label: mw.msg( 'aknedit-element-pane-close' ),
		invisibleLabel: true,
		framed: false
	} );
	this.closeButton.on( 'click', function () {
		this.emit( 'close' );
	}.bind( this ) );

	this.$fields = $( '<div>' );
	this.$attrs = $( '<div>' );

	this.elementButtons = new OO.ui.ButtonGroupWidget( {
		items: [ this.moveUpButton, this.moveDownButton, this.removeButton ]
	} );

	var $headerActions = $( '<div>' ).addClass( 'akn-editor-element-pane-header-actions' ).append(
		this.elementButtons.$element,
		this.closeButton.$element
	);

	this.$element.addClass( 'akn-editor-element-pane' ).append(
		$( '<div>' ).addClass( 'akn-editor-element-pane-header' ).append( this.$heading, $headerActions ),
		this.$fields,
		$( '<h4>' ).addClass( 'akn-editor-dialog-heading' ).text( mw.msg( 'aknedit-attr-heading' ) ),
		this.$attrs
	);
}
OO.inheritClass( ElementPane, OO.ui.Widget );

/**
 * @param {Element} el The structural element to edit.
 * @param {Function} onRelabel Called with the element's fresh outline label whenever its
 *  num/heading changes, so the caller can relabel the corresponding outline row live.
 */
ElementPane.prototype.setElement = function ( el, onRelabel ) {
	var app = this.app;

	// eId is system-managed, not user-editable (see renderAttributeTable) — but every
	// structural element still needs one, so generate it lazily here if it's ever missing.
	if ( !el.getAttribute( 'eId' ) ) {
		el.setAttribute( 'eId', app.nextEid( el.localName ) );
	}

	this.$heading.text( outlineLabel( el ) );
	this.moveUpButton.setDisabled( !app.canMoveSelected( -1 ) );
	this.moveDownButton.setDisabled( !app.canMoveSelected( 1 ) );

	function relabel() {
		onRelabel( outlineLabel( el ) );
	}

	var numField = new TextContentField( function ( create ) {
		var num = firstChild( el, 'num' );
		if ( !num && create ) {
			num = app.doc.createElementNS( AKN_NS, 'num' );
			el.insertBefore( num, el.firstChild );
		}
		return num;
	} );
	var headingField = new TextContentField( function ( create ) {
		var heading = firstChild( el, 'heading' );
		if ( !heading && create ) {
			heading = app.doc.createElementNS( AKN_NS, 'heading' );
			el.appendChild( heading );
		}
		return heading;
	} );

	var numInput = new OO.ui.TextInputWidget( { value: numField.get() } );
	numInput.on( 'change', function ( value ) {
		numField.set( value );
		relabel();
	} );
	var headingInput = new OO.ui.TextInputWidget( { value: headingField.get() } );
	headingInput.on( 'change', function ( value ) {
		headingField.set( value );
		relabel();
	} );

	// eId is shown for reference (it's how this element is cross-referenced elsewhere in the
	// document) but never editable — it's system-managed, see the auto-generation above and
	// renderAttributeTable's exclusion of it from the generic attribute rows.
	var eidInput = new OO.ui.TextInputWidget( { value: el.getAttribute( 'eId' ), disabled: true } );

	var items = [
		new OO.ui.FieldLayout( eidInput, { label: mw.msg( 'aknedit-field-eid' ), align: 'top' } ),
		new OO.ui.FieldLayout( numInput, { label: mw.msg( 'aknedit-field-num' ), align: 'top' } ),
		new OO.ui.FieldLayout( headingInput, { label: mw.msg( 'aknedit-field-heading' ), align: 'top' } )
	];

	if ( el.localName === 'hcontainer' ) {
		var nameOptions = Object.keys( HCONTAINER_LABELS ).map( function ( key ) {
			return { data: key, label: HCONTAINER_LABELS[ key ] + ' (' + key + ')' };
		} );
		var currentHname = el.getAttribute( 'name' ) || '';
		if ( currentHname && nameOptions.every( function ( o ) { return o.data !== currentHname; } ) ) {
			nameOptions.push( { data: currentHname, label: currentHname } );
		}
		nameOptions.unshift( { data: '', label: '—' } );

		var hnameInput = new OO.ui.DropdownInputWidget( { options: nameOptions, value: currentHname } );
		hnameInput.on( 'change', function ( value ) {
			if ( value === '' ) {
				el.removeAttribute( 'name' );
			} else {
				el.setAttribute( 'name', value );
			}
			relabel();
		} );

		var showAsInput = new OO.ui.TextInputWidget( { value: el.getAttribute( 'showAs' ) || '' } );
		showAsInput.on( 'change', function ( value ) {
			if ( value === '' ) {
				el.removeAttribute( 'showAs' );
			} else {
				el.setAttribute( 'showAs', value );
			}
			relabel();
		} );

		items.push(
			new OO.ui.FieldLayout( hnameInput, { label: mw.msg( 'aknedit-field-hcontainer-name' ), align: 'top' } ),
			new OO.ui.FieldLayout( showAsInput, { label: mw.msg( 'aknedit-field-hcontainer-showas' ), align: 'top' } )
		);
	}

	// Pure containers (part/chapter/...) hold nested structural children, not their own
	// prose — per AKN's content model a hierarchical element has *either* children *or*
	// content, never both, and in this corpus containers only ever hold children. Showing
	// an always-empty content field on them would be misleading, so it's omitted entirely.
	if ( formConfigFor( el.localName ).content ) {
		var getContentEl = function ( create ) {
			var content = firstChild( el, 'content' );
			if ( !content && create ) {
				content = app.doc.createElementNS( AKN_NS, 'content' );
				el.appendChild( content );
			}
			return content;
		};
		var contentField = new RawContentField( app, getContentEl );

		// No `autosize` — OOUI disables manual resize (`resize: none`) on autosized
		// textareas, and this field needs to stay resizable by hand for long content.
		var contentInput = new OO.ui.MultilineTextInputWidget( {
			value: contentField.get(),
			rows: 8
		} );
		var contentLayout = new OO.ui.FieldLayout( contentInput, {
			label: mw.msg( 'aknedit-field-content' ),
			align: 'top',
			help: mw.msg( 'aknedit-field-content-help' )
		} );
		contentInput.on( 'change', function ( value ) {
			try {
				contentField.set( value );
				contentInput.setValidityFlag( true );
				contentLayout.setErrors( [] );
			} catch ( e ) {
				contentInput.setValidityFlag( false );
				contentLayout.setErrors( [ mw.msg( 'aknedit-field-content-error' ) ] );
			}
		} );

		// Both modes stay fully editable — this isn't "edit XML / look at a static render",
		// it's two live views of the one `<content>` element. Rich text commits into it on a
		// debounce (mirroring the XML textarea's own 'change' handler above) so the live
		// document is always current regardless of which mode is active when Save happens,
		// the element pane closes, or the mode is flipped again.
		var $richEl = $( '<div>' )
			.addClass( 'akn-editor-dialog-content akn-editor-richtext' )
			.attr( 'contenteditable', 'true' )
			.hide();
		var richEl = $richEl[ 0 ];
		var mode = 'xml';

		var getTarget = function () {
			return mode === 'xml' ? { mode: 'xml', input: contentInput } : { mode: 'richtext', el: richEl };
		};

		var inlineToolbar = buildInlineToolbar( app, getTarget );

		var commitRichTextNow = function () {
			try {
				contentField.set( editableToXmlString( richEl ) );
				contentLayout.setErrors( [] );
			} catch ( e ) {
				contentLayout.setErrors( [ mw.msg( 'aknedit-field-content-error' ) ] );
			}
		};
		$richEl.on( 'input', mw.util.debounce( commitRichTextNow, 300 ) );

		var modeSelect = new OO.ui.ButtonSelectWidget( {
			items: [
				new OO.ui.ButtonOptionWidget( { data: 'xml', label: mw.msg( 'aknedit-content-mode-xml' ) } ),
				new OO.ui.ButtonOptionWidget( { data: 'richtext', label: mw.msg( 'aknedit-content-mode-richtext' ) } )
			]
		} );
		modeSelect.selectItemByData( 'xml' );
		modeSelect.on( 'select', function ( item ) {
			var newMode = item.getData();
			if ( mode === 'richtext' && newMode === 'xml' ) {
				commitRichTextNow();
			}
			mode = newMode;
			if ( mode === 'richtext' ) {
				while ( richEl.firstChild ) {
					richEl.removeChild( richEl.firstChild );
				}
				var built = xmlToEditable( getContentEl( false ) );
				while ( built.firstChild ) {
					richEl.appendChild( built.firstChild );
				}
				contentInput.$element.hide();
				$richEl.show();
			} else {
				contentInput.setValue( contentField.get() );
				$richEl.hide();
				contentInput.$element.show();
			}
			inlineToolbar.toolbar.emit( 'updateState' );
		} );

		// Prepended into the field's own body, right above the textarea it belongs to —
		// $field is FieldLayout's real, documented container for the field widget.
		contentLayout.$field.prepend( $richEl );
		contentLayout.$field.prepend( inlineToolbar.$element );
		contentLayout.$field.prepend( modeSelect.$element );

		items.push( contentLayout );
	}

	this.$fields.empty().append(
		new OO.ui.FieldsetLayout( { items: items } ).$element
	);
	this.$attrs.empty().append( app.renderAttributeTable( el ) );
};
