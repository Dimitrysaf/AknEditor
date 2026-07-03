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
	this.outline = null;
	this.activeElement = null;
}

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

/** Build the OO.ui field descriptors for the metadata dialog. */
AknEditorApp.prototype.buildMetaFields = function () {
	var app = this;
	var vocab = this.vocab;
	var fields = [];

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

	function textField( msgKey, field ) {
		var widget = new OO.ui.TextInputWidget( { value: field.get() } );
		widget.on( 'change', function ( value ) {
			field.set( value );
		} );
		fields.push( new OO.ui.FieldLayout( widget, {
			label: mw.msg( msgKey ),
			align: 'top'
		} ) );
	}

	function dropdownField( msgKey, field, map ) {
		var widget = dropdown( map, field.get() );
		widget.on( 'change', function ( value ) {
			field.set( value );
		} );
		fields.push( new OO.ui.FieldLayout( widget, {
			label: mw.msg( msgKey ),
			align: 'top'
		} ) );
	}

	textField( 'aknedit-field-alias', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRalias', create ); }, 'value'
	) );
	dropdownField( 'aknedit-field-doctype', new AttrField(
		function () { return app.root; }, 'name'
	), vocab.docTypes );
	textField( 'aknedit-field-number', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRnumber', create ); }, 'value'
	) );
	textField( 'aknedit-field-enacted', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRdate', create ); }, 'date'
	) );
	dropdownField( 'aknedit-field-country', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRcountry', create ); }, 'value'
	), vocab.countries );
	dropdownField( 'aknedit-field-language', new AttrField(
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
	textField( 'aknedit-field-fek', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'showAs'
	) );
	textField( 'aknedit-field-fek-series', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'name'
	) );
	textField( 'aknedit-field-fek-number', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'number'
	) );
	textField( 'aknedit-field-fek-date', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'date'
	) );

	return fields;
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
 * Rebuild the outline as a full nested tree (not just top-level `<body>` children):
 * OO.ui.OutlineOptionWidget has a real `level` config built for exactly this, adding an
 * indentation class per depth. `structureEls` stays a flat, traversal-order array — the
 * index a row's `data` points to is depth-independent, so add/remove/move need no changes.
 */
AknEditorApp.prototype.refreshOutline = function () {
	var app = this;
	var outline = this.outline;
	var structureTypes = this.vocab.structureTypes || [];
	var items = [];
	this.structureEls = [];

	function walk( parent, level ) {
		Array.prototype.forEach.call( parent.children, function ( child ) {
			if ( structureTypes.indexOf( child.localName ) === -1 ) {
				return;
			}
			var index = app.structureEls.length;
			app.structureEls.push( child );
			items.push( new OO.ui.OutlineOptionWidget( {
				data: index,
				label: outlineLabel( child ),
				level: level
			} ) );
			walk( child, level + 1 );
		} );
	}

	outline.clearItems();
	if ( this.body ) {
		walk( this.body, 0 );
	}
	outline.addItems( items );
};

/**
 * Add a new structural element of `type` as the last child of the active element (or of
 * `<body>`). Uses `this.activeElement` — a direct DOM reference, not the outline's own
 * (deliberately ephemeral, see buildOutlinePanel) visual selection — so it survives the
 * outline being visually deselected once its modal closes.
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
		app.activeElement = null;
		app.refreshOutline();
	} );
};

/** Move the active element earlier ( -1 ) or later ( +1 ) among its siblings. */
AknEditorApp.prototype.moveSelected = function ( offset ) {
	if ( !this.activeElement ) {
		return;
	}
	var el = this.activeElement;
	var sibling = offset < 0 ? el.previousElementSibling : el.nextElementSibling;
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
 * ElementDialog#setElement, which auto-generates one if missing).
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
				framed: false
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
 * Build the outline panel. Selecting a row opens `elementDialog` as a modal (per explicit
 * feedback: clicking an object must open a dialog, not an always-visible inline panel) —
 * `windowManager`/`elementDialog` are constructed once in mount() and passed in.
 *
 * Clicking a row should read as *pressing* it, not toggling a persistent selection (per
 * explicit feedback) — so the row's highlight is cleared as soon as its modal closes. The
 * element itself stays the target for the toolbar's Add/Remove/Move tools via
 * `app.activeElement`, tracked separately from the outline's own (now purely visual,
 * momentary) selection state.
 */
AknEditorApp.prototype.buildOutlinePanel = function ( windowManager, elementDialog ) {
	var app = this;
	var outline = new OO.ui.OutlineSelectWidget();
	this.outline = outline;
	this.refreshOutline();

	outline.on( 'select', function () {
		var selected = outline.findSelectedItem();
		if ( !selected ) {
			return;
		}
		var el = app.structureEls[ selected.getData() ];
		app.activeElement = el;
		elementDialog.setElement( el, selected );
		windowManager.openWindow( elementDialog, { title: el.localName } ).closed.then( function () {
			outline.selectItem( null );
		} );
	} );

	var $panel = $( '<div>' ).addClass( 'akn-editor-outline' );
	$panel.append(
		$( '<h3>' ).text( mw.msg( 'aknedit-outline-heading' ) ),
		outline.$element
	);
	return $panel;
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
	var elementDialog = new ElementDialog( app );
	windowManager.addWindows( [ saveDialog, metadataDialog, elementDialog ] );
	metadataDialog.setFields( this.buildMetaFields() );

	function showChangesFlow() {
		var baseRevId = mw.config.get( 'wgAknEditorBaseRevId' );
		if ( !baseRevId ) {
			saveDialog.setReviewContent( $( '<p>' ).text( mw.msg( 'aknedit-showchanges-none' ) ) );
			windowManager.openWindow( saveDialog, { initialPanel: 'review' } );
			return;
		}
		app.compareChanges().done( function ( result ) {
			var body = result.compare && result.compare.body;
			saveDialog.setReviewContent(
				body ? $( '<div>' ).addClass( 'akn-editor-diff' ).html( body ) :
					$( '<p>' ).text( mw.msg( 'aknedit-showchanges-none' ) )
			);
			windowManager.openWindow( saveDialog, { initialPanel: 'review' } );
		} ).fail( function ( code, result ) {
			OO.ui.alert( apiErrorDetail( code, result ) );
		} );
	}

	function previewFlow() {
		app.previewRender().done( function ( result ) {
			var html = result.parse && result.parse.text;
			saveDialog.setPreviewContent( $( '<div>' ).html( html || '' ) );
			windowManager.openWindow( saveDialog, { initialPanel: 'preview' } );
		} ).fail( function ( code, result ) {
			OO.ui.alert( apiErrorDetail( code, result ) );
		} );
	}

	var toolFactory = new OO.ui.ToolFactory();
	var toolGroupFactory = new OO.ui.ToolGroupFactory();
	// `actions: true` turns on OO.ui.Toolbar's own built-in $actions area (a real part of
	// .oo-ui-toolbar-bar, floated after the tool groups) — verified in
	// resources/lib/ooui/oojs-ui-toolbars.js:298-349. Save/Cancel live there instead of in
	// a hand-rolled sibling <div>, which is what made the toolbar read as a detached island.
	var toolbar = new OO.ui.Toolbar( toolFactory, toolGroupFactory, { actions: true } );

	registerAddTool( toolFactory, app );
	registerTool( toolFactory, 'remove', 'trash', 'aknedit-tool-remove', function () { app.removeSelected(); } );
	registerTool( toolFactory, 'moveup', 'upTriangle', 'aknedit-tool-moveup', function () { app.moveSelected( -1 ); } );
	registerTool( toolFactory, 'movedown', 'downTriangle', 'aknedit-tool-movedown', function () { app.moveSelected( 1 ); } );
	registerTool( toolFactory, 'validate', 'check', 'aknedit-tool-validate', function () { app.showValidation(); } );
	registerTool( toolFactory, 'metadata', 'tag', 'aknedit-tool-metadata', function () { windowManager.openWindow( metadataDialog ); } );
	registerTool( toolFactory, 'showchanges', 'diffs', 'aknedit-tool-showchanges', showChangesFlow );
	registerTool( toolFactory, 'preview', 'eye', 'aknedit-tool-preview', previewFlow );

	toolbar.setup( [ { name: 'akn', type: 'bar', include: TOOL_NAMES } ] );
	toolbar.initialize();

	var saveButton = new OO.ui.ButtonWidget( { label: mw.msg( 'aknedit-save' ), flags: [ 'primary', 'progressive' ] } );
	var cancelButton = new OO.ui.ButtonWidget( { label: mw.msg( 'aknedit-cancel' ) } );

	saveButton.on( 'click', function () {
		var instance = windowManager.openWindow( saveDialog );
		instance.opened.then( function () {
			saveDialog.once( 'save', function ( summary ) {
				app.save( summary ).done( function () {
					location.href = mw.util.getUrl( mw.config.get( 'wgAknEditorTitle' ) );
				} ).fail( function ( code, result ) {
					OO.ui.alert( mw.msg( 'aknedit-save-error', apiErrorDetail( code, result ) ) );
				} );
			} );
		} );
	} );
	cancelButton.on( 'click', function () {
		location.href = mw.util.getUrl( mw.config.get( 'wgAknEditorTitle' ) );
	} );

	// A ButtonGroupWidget merges the two buttons' borders and removes the gap between them,
	// instead of leaving them as two independent, separately-rounded buttons.
	var saveActions = new OO.ui.ButtonGroupWidget( { items: [ saveButton, cancelButton ] } );
	toolbar.$actions.append( saveActions.$element );
	var $toolbar = $( '<div>' ).addClass( 'akn-editor-toolbar' ).append( toolbar.$element );

	var $outline = this.buildOutlinePanel( windowManager, elementDialog );

	$root.empty().append( $toolbar, $outline );
};
