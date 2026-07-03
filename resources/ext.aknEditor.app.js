/**
 * The editor's whole state: one parsed XML DOM, plus the widgets bound to it.
 *
 * @param {string} xmlText
 */
function AknEditorApp( xmlText ) {
	this.doc = new DOMParser().parseFromString( xmlText, 'application/xml' );
	this.root = findRoot( this.doc );
	this.meta = this.root ? firstChild( this.root, 'meta' ) : null;
	this.body = this.root ? firstChild( this.root, 'body' ) : null;
	this.vocab = mw.config.get( 'wgAknVocabulary' ) || {};
	this.structureEls = [];
	this.eidCounter = 0;
	this.outlineGroup = null;
	this.activeElement = null;
	this.activeRow = null;
	this.elementPane = null;
	this.toolbar = null;
	this.onDocRestored = null;
	this.collapsedElements = new Set();

	this.undoStack = [];
	this.redoStack = [];
	this.lastSnapshot = new XMLSerializer().serializeToString( this.doc );

	var app = this;
	this.observer = new MutationObserver( function () {
		app.undoStack.push( app.lastSnapshot );
		app.redoStack = [];
		app.lastSnapshot = new XMLSerializer().serializeToString( app.doc );
		if ( app.toolbar ) {
			app.toolbar.emit( 'updateState' );
		}
	} );
	this.observer.observe( this.doc, { childList: true, attributes: true, characterData: true, subtree: true } );
}

AknEditorApp.prototype.canUndo = function () {
	return this.undoStack.length > 0;
};

AknEditorApp.prototype.canRedo = function () {
	return this.redoStack.length > 0;
};

AknEditorApp.prototype.undo = function () {
	if ( !this.canUndo() ) {
		return;
	}
	this.redoStack.push( this.lastSnapshot );
	this.restoreSnapshot( this.undoStack.pop() );
};

AknEditorApp.prototype.redo = function () {
	if ( !this.canRedo() ) {
		return;
	}
	this.undoStack.push( this.lastSnapshot );
	this.restoreSnapshot( this.redoStack.pop() );
};

AknEditorApp.prototype.restoreSnapshot = function ( xmlText ) {
	this.observer.disconnect();
	this.doc = new DOMParser().parseFromString( xmlText, 'application/xml' );
	this.observer.observe( this.doc, { childList: true, attributes: true, characterData: true, subtree: true } );

	this.root = findRoot( this.doc );
	this.meta = this.root ? firstChild( this.root, 'meta' ) : null;
	this.body = this.root ? firstChild( this.root, 'body' ) : null;
	this.lastSnapshot = xmlText;

	this.closeElementPane();
	this.refreshOutline();
	if ( this.onDocRestored ) {
		this.onDocRestored();
	}
	if ( this.toolbar ) {
		this.toolbar.emit( 'updateState' );
	}
};

/** Find-or-create an `<identification>` descendant chain under `<meta>`. */
AknEditorApp.prototype.identificationChild = function ( localName, create ) {
	if ( !this.meta ) {
		return null;
	}
	var ident = firstChild( this.meta, 'identification' );
	if ( !ident ) {
		return null;
	}
	var el = firstChild( ident, localName );
	if ( !el && create ) {
		el = this.doc.createElementNS( AKN_NS, localName );
		ident.appendChild( el );
	}
	return el;
};

/** Find-or-create the `<meta><publication>` element (absent until a law is gazetted). */
AknEditorApp.prototype.publicationEl = function ( create ) {
	if ( !this.meta ) {
		return null;
	}
	var pub = firstChild( this.meta, 'publication' );
	if ( !pub && create ) {
		pub = this.doc.createElementNS( AKN_NS, 'publication' );
		this.meta.appendChild( pub );
	}
	return pub;
};

/**
 * Build the OO.ui field descriptors for the metadata dialog, split by the dialog's two
 * BookletLayout pages (see MetadataDialog in ext.aknEditor.dialogs.js).
 *
 * @return {Object} `{ identification: OO.ui.FieldLayout[], publication: OO.ui.FieldLayout[] }`
 */
AknEditorApp.prototype.buildMetaFields = function () {
	var app = this;
	var vocab = this.vocab;
	var identificationFields = [];
	var publicationFields = [];

	function dropdown( map, current ) {
		var options = Object.keys( map || {} ).map( function ( code ) {
			return { data: code, label: map[ code ] + ' (' + code + ')' };
		} );
		if ( current && map && !map[ current ] ) {
			options.push( { data: current, label: current } );
		}
		options.unshift( { data: '', label: '—' } );
		return new OO.ui.DropdownInputWidget( { options: options, value: current || '' } );
	}

	function textField( fields, msgKey, field ) {
		var widget = new OO.ui.TextInputWidget( { value: field.get() } );
		widget.on( 'change', function ( value ) {
			field.set( value );
		} );
		fields.push( new OO.ui.FieldLayout( widget, {
			label: mw.msg( msgKey ),
			align: 'top'
		} ) );
	}

	function dropdownField( fields, msgKey, field, map ) {
		var widget = dropdown( map, field.get() );
		widget.on( 'change', function ( value ) {
			field.set( value );
		} );
		fields.push( new OO.ui.FieldLayout( widget, {
			label: mw.msg( msgKey ),
			align: 'top'
		} ) );
	}

	textField( identificationFields, 'aknedit-field-alias', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRalias', create ); }, 'value'
	) );
	dropdownField( identificationFields, 'aknedit-field-doctype', new AttrField(
		function () { return app.root; }, 'name'
	), vocab.docTypes );
	textField( identificationFields, 'aknedit-field-number', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRnumber', create ); }, 'value'
	) );
	textField( identificationFields, 'aknedit-field-enacted', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRdate', create ); }, 'date'
	) );
	dropdownField( identificationFields, 'aknedit-field-country', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRcountry', create ); }, 'value'
	), vocab.countries );
	dropdownField( identificationFields, 'aknedit-field-language', new AttrField(
		function ( create ) {
			var expr = app.meta ? firstChild( app.meta, 'identification' ) : null;
			expr = expr ? firstChild( expr, 'FRBRExpression' ) : null;
			if ( !expr ) {
				return null;
			}
			var lang = firstChild( expr, 'FRBRlanguage' );
			if ( !lang && create ) {
				lang = app.doc.createElementNS( AKN_NS, 'FRBRlanguage' );
				expr.appendChild( lang );
			}
			return lang;
		}, 'language'
	), vocab.languages );
	textField( publicationFields, 'aknedit-field-fek', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'showAs'
	) );
	textField( publicationFields, 'aknedit-field-fek-series', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'name'
	) );
	textField( publicationFields, 'aknedit-field-fek-number', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'number'
	) );
	textField( publicationFields, 'aknedit-field-fek-date', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'date'
	) );

	return { identification: identificationFields, publication: publicationFields };
};

/** A short, doc-unique eId for a freshly added structural element. */
AknEditorApp.prototype.nextEid = function ( type ) {
	var candidate;
	do {
		this.eidCounter++;
		candidate = type + '_new_' + this.eidCounter;
	} while ( this.doc.querySelector( '[eId="' + candidate + '"]' ) );
	return candidate;
};

/**
 * Rebuild the outline as a full nested tree (not just top-level `<body>` children), using a
 * fresh set of OutlineRow widgets each time — simple and cheap enough at this document scale,
 * and it keeps one source of truth (`activeElement`) driving which row (if any) shows as
 * active, instead of trying to patch existing rows in place. `structureEls` stays a flat,
 * traversal-order array read by `renderAttributeTable` callers and the toolbar's Add/Remove/
 * Move tools.
 */
AknEditorApp.prototype.refreshOutline = function () {
	var app = this;
	var group = this.outlineGroup;
	var structureTypes = this.vocab.structureTypes || [];
	var rows = [];
	this.structureEls = [];
	this.activeRow = null;

	function hasStructureChildren( el ) {
		return Array.prototype.some.call( el.children, function ( child ) {
			return structureTypes.indexOf( child.localName ) !== -1;
		} );
	}

	function walk( parent, level ) {
		Array.prototype.forEach.call( parent.children, function ( child ) {
			if ( structureTypes.indexOf( child.localName ) === -1 ) {
				return;
			}
			app.structureEls.push( child );
			var hasChildren = hasStructureChildren( child );
			var collapsed = hasChildren && app.collapsedElements.has( child );
			var row = new OutlineRow( child, outlineLabel( child ), level, hasChildren, collapsed );
			row.on( 'select', app.selectElement.bind( app, child, row ) );
			row.on( 'togglecollapse', function () {
				if ( app.collapsedElements.has( child ) ) {
					app.collapsedElements.delete( child );
				} else {
					app.collapsedElements.add( child );
				}
				app.refreshOutline();
			} );
			if ( child === app.activeElement ) {
				app.activeRow = row;
				row.setActive( true );
			}
			rows.push( row );
			if ( !collapsed ) {
				walk( child, level + 1 );
			}
		} );
	}

	group.clearItems();
	if ( this.body ) {
		walk( this.body, 0 );
	}
	group.addItems( rows );

	if ( app.activeRow ) {
		// The active element is still in the tree (this rebuild came from an unrelated
		// mutation, e.g. Add/drag-reorder elsewhere) — its row instance is now a fresh one,
		// so rebind the pane's relabel callback to it rather than tearing the pane down.
		app.elementPane.setElement( app.activeElement, function ( label ) { app.activeRow.setLabel( label ); } );
	} else if ( app.activeElement ) {
		// The active element itself was just removed from the tree.
		app.closeElementPane();
	}
};

/**
 * Add a new structural element of `type` as the last child of the active element (or of
 * `<body>`). Uses `this.activeElement`, tracked independently of the outline row widgets
 * themselves (which get rebuilt from scratch on every refreshOutline()).
 */
AknEditorApp.prototype.addElement = function ( type ) {
	if ( !this.body ) {
		return;
	}
	var el = this.doc.createElementNS( AKN_NS, type );
	el.setAttribute( 'eId', this.nextEid( type ) );
	if ( this.activeElement ) {
		this.activeElement.appendChild( el );
	} else {
		this.body.appendChild( el );
	}
	this.refreshOutline();
};

/** Remove the active element, after confirmation. */
AknEditorApp.prototype.removeSelected = function () {
	var app = this;
	if ( !this.activeElement ) {
		return;
	}
	OO.ui.confirm( mw.msg( 'aknedit-remove-confirm' ) ).done( function ( confirmed ) {
		if ( !confirmed ) {
			return;
		}
		app.activeElement.parentNode.removeChild( app.activeElement );
		app.closeElementPane();
		app.refreshOutline();
	} );
};

/** The nearest sibling of `el` that's itself a structural element, skipping `<num>`/`<heading>`/etc. */
AknEditorApp.prototype.structuralSibling = function ( el, offset ) {
	var structureTypes = this.vocab.structureTypes || [];
	var sibling = offset < 0 ? el.previousElementSibling : el.nextElementSibling;
	while ( sibling && structureTypes.indexOf( sibling.localName ) === -1 ) {
		sibling = offset < 0 ? sibling.previousElementSibling : sibling.nextElementSibling;
	}
	return sibling;
};

/** Whether the active element has a structural sibling to move earlier ( -1 ) or later ( +1 ) into. */
AknEditorApp.prototype.canMoveSelected = function ( offset ) {
	return !!this.activeElement && !!this.structuralSibling( this.activeElement, offset );
};

/** Move the active element earlier ( -1 ) or later ( +1 ) among its siblings. */
AknEditorApp.prototype.moveSelected = function ( offset ) {
	if ( !this.activeElement ) {
		return;
	}
	var el = this.activeElement;
	var sibling = this.structuralSibling( el, offset );
	if ( !sibling ) {
		return;
	}
	if ( offset < 0 ) {
		el.parentNode.insertBefore( el, sibling );
	} else {
		el.parentNode.insertBefore( sibling, el );
	}
	this.refreshOutline();
};

/**
 * Render the attribute-editing table for `el` into a fresh container. `eId` is deliberately
 * excluded — it's a system-managed identity, not a user-editable attribute (see
 * ElementPane#setElement, which auto-generates one if missing).
 */
AknEditorApp.prototype.renderAttributeTable = function ( el ) {
	var $rows = $( '<div>' ).addClass( 'akn-editor-attr-rows' );

	function row( nameInput, valueInput, actionButton ) {
		return $( '<div>' ).addClass( 'akn-editor-attr-row' ).append(
			nameInput.$element, valueInput.$element, actionButton.$element
		);
	}

	function render() {
		$rows.empty();
		Array.prototype.forEach.call( el.attributes, function ( attr ) {
			if ( attr.name === 'eId' ) {
				return;
			}
			var currentName = attr.name;
			var nameInput = new OO.ui.TextInputWidget( { value: attr.name } );
			var valueInput = new OO.ui.TextInputWidget( { value: attr.value } );
			var removeButton = new OO.ui.ButtonWidget( {
				icon: 'trash',
				label: mw.msg( 'aknedit-attr-remove' ),
				invisibleLabel: true,
				framed: false,
				flags: [ 'destructive' ]
			} );

			nameInput.on( 'change', function ( newName ) {
				newName = newName.trim();
				if ( newName === currentName ) {
					return;
				}
				var value = el.getAttribute( currentName ) || '';
				if ( currentName !== '' ) {
					el.removeAttribute( currentName );
				}
				if ( newName !== '' ) {
					el.setAttribute( newName, value );
				}
				currentName = newName;
			} );
			valueInput.on( 'change', function ( value ) {
				if ( currentName !== '' ) {
					el.setAttribute( currentName, value );
				}
			} );
			removeButton.on( 'click', function () {
				if ( currentName !== '' ) {
					el.removeAttribute( currentName );
				}
				render();
			} );

			$rows.append( row( nameInput, valueInput, removeButton ) );
		} );

		var newName = new OO.ui.TextInputWidget( { placeholder: mw.msg( 'aknedit-attr-name' ) } );
		var newValue = new OO.ui.TextInputWidget( { placeholder: mw.msg( 'aknedit-attr-value' ) } );
		var addButton = new OO.ui.ButtonWidget( { icon: 'add', label: mw.msg( 'aknedit-attr-add' ), invisibleLabel: true, framed: false } );
		addButton.on( 'click', function () {
			var name = newName.getValue().trim();
			if ( name === '' || name === 'eId' ) {
				return;
			}
			el.setAttribute( name, newValue.getValue() );
			render();
		} );
		$rows.append( row( newName, newValue, addButton ) );
	}

	render();
	return $rows;
};

/**
 * Open (or refresh) the element pane for `el`, splitting the workspace in two — replaces the
 * previous per-click modal per explicit feedback: the pane lives beside the outline instead of
 * floating over it, and stays open across selections instead of closing every time.
 *
 * @param {Element} el
 * @param {Object} row The OutlineRow currently representing `el`, relabelled live as its
 *  num/heading change.
 */
AknEditorApp.prototype.selectElement = function ( el, row ) {
	if ( this.activeRow ) {
		this.activeRow.setActive( false );
	}
	this.activeElement = el;
	this.activeRow = row;
	row.setActive( true );
	this.elementPane.setElement( el, function ( label ) { row.setLabel( label ); } );
	this.$workspace.addClass( 'akn-editor-workspace-split' );
};

/** Close the element pane and collapse the workspace back to a single outline column. */
AknEditorApp.prototype.closeElementPane = function () {
	if ( this.activeRow ) {
		this.activeRow.setActive( false );
	}
	this.activeElement = null;
	this.activeRow = null;
	this.$workspace.removeClass( 'akn-editor-workspace-split' );
};

/**
 * Build the two-column workspace: the outline on the left, and the (initially hidden) element
 * pane on the right, which the workspace splits open once a row is selected. Reordering rows
 * by dragging their handle uses OOUI's own DraggableGroupElement (see OutlineGroup in
 * ext.aknEditor.toolbar.js); a reorder is only committed to the document if the row was
 * dropped next to an actual sibling in the underlying tree — same "siblings only" constraint
 * the moveup/movedown tools already have — otherwise this simply rebuilds the outline from the
 * real document order, snapping the row back.
 *
 * @param {ElementPane} elementPane
 * @return {jQuery}
 */
AknEditorApp.prototype.buildWorkspace = function ( elementPane ) {
	var app = this;
	this.elementPane = elementPane;
	elementPane.on( 'close', function () { app.closeElementPane(); } );

	var group = new OutlineGroup();
	this.outlineGroup = group;
	this.refreshOutline();

	group.on( 'reorder', function ( item ) {
		var $prev = item.$element.prev();
		var $next = item.$element.next();
		var prevRow = $prev.data( 'aknOutlineRow' );
		var nextRow = $next.data( 'aknOutlineRow' );
		var el = item.el;
		var parent = el.parentNode;
		if ( prevRow && prevRow.el.parentNode === parent ) {
			parent.insertBefore( el, prevRow.el.nextSibling );
		} else if ( nextRow && nextRow.el.parentNode === parent ) {
			parent.insertBefore( el, nextRow.el );
		}
		app.refreshOutline();
	} );

	var $outlineCol = $( '<div>' ).addClass( 'akn-editor-outline-col' ).append(
		$( '<h3>' ).text( mw.msg( 'aknedit-outline-heading' ) ),
		group.$element
	);

	this.$workspace = $( '<div>' ).addClass( 'akn-editor-workspace' ).append(
		$outlineCol,
		elementPane.$element
	);
	return this.$workspace;
};

/** Structural sanity check — not full AKN/RelaxNG schema validation, see plan notes. */
AknEditorApp.prototype.runValidation = function () {
	var issues = [];
	var seen = Object.create( null );
	Array.prototype.forEach.call( this.doc.querySelectorAll( '[eId]' ), function ( el ) {
		var id = el.getAttribute( 'eId' );
		if ( id === '' ) {
			issues.push( mw.msg( 'aknedit-validate-missing-eid' ) );
		} else if ( seen[ id ] ) {
			issues.push( mw.msg( 'aknedit-validate-dup-eid', id ) );
		}
		seen[ id ] = true;
	} );
	if ( !this.identificationChild( 'FRBRWork', false ) ) {
		issues.push( mw.msg( 'aknedit-validate-missing-meta' ) );
	}
	if ( !this.body || this.body.children.length === 0 ) {
		issues.push( mw.msg( 'aknedit-validate-missing-body' ) );
	}
	return issues;
};

AknEditorApp.prototype.showValidation = function () {
	var issues = this.runValidation();
	if ( issues.length === 0 ) {
		OO.ui.alert( mw.msg( 'aknedit-validate-ok' ), { title: mw.msg( 'aknedit-validate-title' ) } );
		return;
	}
	var $list = $( '<div>' ).append(
		$( '<p>' ).text( mw.msg( 'aknedit-validate-issues' ) ),
		$( '<ul>' ).append( issues.map( function ( msg ) { return $( '<li>' ).text( msg ); } ) )
	);
	OO.ui.alert( $list, { title: mw.msg( 'aknedit-validate-title' ) } );
};

AknEditorApp.prototype.save = function ( summary ) {
	var xml = new XMLSerializer().serializeToString( this.doc );
	return new mw.Api().postWithToken( 'csrf', {
		action: 'edit',
		title: mw.config.get( 'wgAknEditorTitle' ),
		text: xml,
		contentmodel: 'akn-xml',
		contentformat: 'application/xml',
		baserevid: mw.config.get( 'wgAknEditorBaseRevId' ),
		summary: summary
	} );
};

/** Diff the in-editor document against the last saved revision, via the stock compare API. */
AknEditorApp.prototype.compareChanges = function () {
	var xml = new XMLSerializer().serializeToString( this.doc );
	return new mw.Api().post( {
		action: 'compare',
		formatversion: 2,
		fromrev: mw.config.get( 'wgAknEditorBaseRevId' ),
		totext: xml,
		totitle: mw.config.get( 'wgAknEditorTitle' ),
		tocontentmodel: 'akn-xml',
		prop: 'diff'
	} );
};

/** Render the in-editor document through AknRenderer's real renderer, without saving. */
AknEditorApp.prototype.previewRender = function () {
	var xml = new XMLSerializer().serializeToString( this.doc );
	return new mw.Api().post( {
		action: 'parse',
		formatversion: 2,
		title: mw.config.get( 'wgAknEditorTitle' ),
		text: xml,
		contentmodel: 'akn-xml',
		contentformat: 'application/xml',
		prop: 'text'
	} );
};

AknEditorApp.prototype.mount = function ( $root ) {
	var app = this;
	var windowManager = new OO.ui.WindowManager();
	$( document.body ).append( windowManager.$element );

	var saveDialog = new SaveDialog();
	var metadataDialog = new MetadataDialog();
	windowManager.addWindows( [ saveDialog, metadataDialog ] );
	var elementPane = new ElementPane( app );
	var metaFields = this.buildMetaFields();
	metadataDialog.setFields( metaFields.identification, metaFields.publication );

	app.onDocRestored = function () {
		var freshMetaFields = app.buildMetaFields();
		metadataDialog.setFields( freshMetaFields.identification, freshMetaFields.publication );
	};

	/**
	 * Fetch the diff and swap to the review panel of the already-open save dialog. Matches
	 * ve.ui.MWSaveDialog's own review flow (verified against ve.ui.MWSaveDialog.js:
	 * pushPending()/popPending() around the async fetch, then swapPanel( 'review' )) rather
	 * than opening a separate window from outside.
	 */
	function showChangesFlow() {
		var baseRevId = mw.config.get( 'wgAknEditorBaseRevId' );
		if ( !baseRevId ) {
			saveDialog.setReviewContent( $( '<p>' ).text( mw.msg( 'aknedit-showchanges-none' ) ) );
			saveDialog.swapPanel( 'review' );
			return;
		}
		saveDialog.pushPending();
		app.compareChanges().done( function ( result ) {
			var body = result.compare && result.compare.body;
			saveDialog.setReviewContent(
				body ? $( '<div>' ).addClass( 'akn-editor-diff' ).html( body ) :
					$( '<p>' ).text( mw.msg( 'aknedit-showchanges-none' ) )
			);
			saveDialog.swapPanel( 'review' );
		} ).fail( function ( code, result ) {
			OO.ui.alert( apiErrorDetail( code, result ) );
		} ).always( function () {
			saveDialog.popPending();
		} );
	}

	function previewFlow() {
		saveDialog.pushPending();
		app.previewRender().done( function ( result ) {
			var html = result.parse && result.parse.text;
			saveDialog.setPreviewContent( $( '<div>' ).html( html || '' ) );
			saveDialog.swapPanel( 'preview' );
		} ).fail( function ( code, result ) {
			OO.ui.alert( apiErrorDetail( code, result ) );
		} ).always( function () {
			saveDialog.popPending();
		} );
	}

	// Bound once, on the shared dialog instance — not per Save-button click — so repeated
	// open/cancel cycles don't stack duplicate listeners (each 'save' would otherwise fire
	// every previously-bound handler, re-POSTing the edit).
	saveDialog.on( 'review', showChangesFlow );
	saveDialog.on( 'preview', previewFlow );
	saveDialog.on( 'save', function ( summary, deferred ) {
		app.save( summary ).done( function () {
			deferred.resolve();
			location.href = mw.util.getUrl( mw.config.get( 'wgAknEditorTitle' ) );
		} ).fail( function ( code, result ) {
			deferred.reject( new OO.ui.Error( mw.msg( 'aknedit-save-error', apiErrorDetail( code, result ) ), { recoverable: true } ) );
		} );
	} );

	var toolFactory = new OO.ui.ToolFactory();
	var toolGroupFactory = new OO.ui.ToolGroupFactory();
	var toolbar = new OO.ui.Toolbar( toolFactory, toolGroupFactory, { actions: true } );
	app.toolbar = toolbar;

	var addToolNames = registerAddTools( toolFactory, app );
	registerHistoryTools( toolFactory, app );
	registerTool( toolFactory, 'validate', 'check', 'aknedit-tool-validate', function () { app.showValidation(); }, true );
	registerTool( toolFactory, 'metadata', 'tag', 'aknedit-tool-metadata', function () { windowManager.openWindow( metadataDialog ); }, true );

	toolbar.setup( [
		{
			name: 'add',
			type: 'list',
			icon: 'add',
			invisibleLabel: false,
			label: mw.msg( 'aknedit-tool-add' ),
			include: addToolNames
		},
		{ name: 'history', type: 'bar', include: [ 'undo', 'redo' ] },
		{ name: 'page', type: 'bar', include: [ 'validate', 'metadata' ] }
	] );
	toolbar.initialize();
	toolbar.emit( 'updateState' );

	var saveButton = new OO.ui.ButtonWidget( { label: mw.msg( 'aknedit-save' ), flags: [ 'primary', 'progressive' ] } );
	var cancelButton = new OO.ui.ButtonWidget( { label: mw.msg( 'aknedit-cancel' ) } );

	saveButton.on( 'click', function () {
		windowManager.openWindow( saveDialog );
	} );
	cancelButton.on( 'click', function () {
		location.href = mw.util.getUrl( mw.config.get( 'wgAknEditorTitle' ) );
	} );

	var saveActions = new OO.ui.ButtonGroupWidget( { items: [ saveButton, cancelButton ] } );
	toolbar.$actions.append( saveActions.$element );
	var $toolbar = $( '<div>' ).addClass( 'akn-editor-toolbar' ).append( toolbar.$element );

	var $workspace = this.buildWorkspace( elementPane );

	$root.empty().append( $toolbar, $workspace );

	// The element pane is sticky (see .akn-editor-element-pane), pinned below the toolbar
	// while the (potentially long) outline scrolls past it — per explicit feedback, preferred
	// over making the outline column itself the scrollable one. The toolbar's real height
	// varies by skin/viewport width (OOUI's own toolbar can wrap to two lines), so it's read
	// via JS into a CSS variable rather than hardcoded.
	function updateStickyOffset() {
		$root.css( '--akn-editor-toolbar-height', $toolbar.outerHeight() + 'px' );
	}
	updateStickyOffset();
	$( window ).on( 'resize', updateStickyOffset );
};
