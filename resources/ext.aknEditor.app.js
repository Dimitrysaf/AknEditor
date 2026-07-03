( function () {
	'use strict';

	var AKN_NS = 'http://docs.oasis-open.org/legaldocml/ns/akn/3.0';
	var ROOT_TYPES = [ 'act', 'bill', 'doc' ];
	var TOOL_NAMES = [ 'add', 'remove', 'moveup', 'movedown', 'validate', 'metadata', 'showchanges', 'preview' ];

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

	/** Attribute-backed form field: reads/writes one attribute of a (possibly absent) element. */
	function AttrField( getElement, attr ) {
		this.getElement = getElement;
		this.attr = attr;
	}

	AttrField.prototype.get = function () {
		var el = this.getElement( false );
		return el ? el.getAttribute( this.attr ) || '' : '';
	};

	AttrField.prototype.set = function ( value ) {
		var el = this.getElement( true );
		if ( value === '' ) {
			el.removeAttribute( this.attr );
		} else {
			el.setAttribute( this.attr, value );
		}
	};

	/** Text-content-backed form field: reads/writes the textContent of a (possibly absent) child. */
	function TextContentField( getElement ) {
		this.getElement = getElement;
	}

	TextContentField.prototype.get = function () {
		var el = this.getElement( false );
		return el ? el.textContent : '';
	};

	TextContentField.prototype.set = function ( value ) {
		var el = this.getElement( true );
		el.textContent = value;
	};

	/**
	 * Content-backed field: get/set the raw inner markup of an AKN `<content>` block (which
	 * normally holds one or more `<p>`s with inline markup — `<term>`, `<b>`, `<ref>`, etc.) as
	 * an editable XML-fragment string. Not a rich-text surface — this is plain text editing of
	 * the underlying markup, consistent with the structured-editor scope — but it's real access
	 * to an element's actual body content, not just its `<num>`/`<heading>` labels.
	 */
	function RawContentField( app, getElement ) {
		this.app = app;
		this.getElement = getElement;
	}

	RawContentField.prototype.get = function () {
		var content = this.getElement( false );
		if ( !content ) {
			return '';
		}
		var serializer = new XMLSerializer();
		return Array.prototype.map.call( content.childNodes, function ( node ) {
			return node.nodeType === Node.TEXT_NODE ? node.textContent : serializer.serializeToString( node );
		} ).join( '' ).trim();
	};

	/** @throws {Error} If `text` isn't well-formed XML — caller must not treat the field as saved. */
	RawContentField.prototype.set = function ( text ) {
		var app = this.app;
		var wrapped = '<content xmlns="' + AKN_NS + '">' + text + '</content>';
		var parsed = new DOMParser().parseFromString( wrapped, 'application/xml' );
		if ( parsed.getElementsByTagName( 'parsererror' ).length ) {
			throw new Error( 'invalid markup' );
		}
		var content = this.getElement( true );
		while ( content.firstChild ) {
			content.removeChild( content.firstChild );
		}
		Array.prototype.forEach.call( parsed.documentElement.childNodes, function ( node ) {
			content.appendChild( app.doc.importNode( node, true ) );
		} );
	};

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

	/** Label an outline item from its <num>/<heading>, falling back to the tag name. */
	function outlineLabel( el ) {
		var num = firstChild( el, 'num' );
		var heading = firstChild( el, 'heading' );
		var label = [ num ? num.textContent : '', heading ? heading.textContent : '' ]
			.join( ' ' )
			.trim();
		return label !== '' ? label : el.localName;
	}

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
		{ action: 'back', modes: [ 'review', 'preview' ], label: mw.msg( 'aknedit-cancel' ), flags: 'safe' }
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

	SaveDialog.prototype.getActionProcess = function ( action ) {
		var dialog = this;
		if ( action === 'save' ) {
			return new OO.ui.Process( function () {
				dialog.emit( 'save', dialog.summaryInput.getValue() );
				dialog.close( { action: action } );
			} );
		}
		if ( action === 'back' ) {
			return new OO.ui.Process( function () {
				dialog.swapPanel( 'save' );
			} );
		}
		return SaveDialog.super.prototype.getActionProcess.call( this, action );
	};

	/** Metadata form, moved into a dialog so the outline can span the full width. */
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
		this.fieldset = new OO.ui.FieldsetLayout();
		var panel = new OO.ui.PanelLayout( { padded: true, expanded: false } );
		panel.$element.append( this.fieldset.$element );
		this.$body.append( panel.$element );
	};

	MetadataDialog.prototype.setFields = function ( fields ) {
		this.fieldset.clearItems();
		this.fieldset.addItems( fields );
	};

	MetadataDialog.prototype.getBodyHeight = function () {
		return 400;
	};

	/**
	 * Per-element editor, opened as a modal when an outline row is selected (per explicit
	 * feedback — this must be a dialog, not an inline panel). Wraps the same attribute-table
	 * and num/heading field logic the old inline panel used, unchanged.
	 *
	 * @param {AknEditorApp} app
	 */
	function ElementDialog( app, config ) {
		ElementDialog.super.call( this, config );
		this.app = app;
	}
	OO.inheritClass( ElementDialog, OO.ui.ProcessDialog );
	ElementDialog.static.name = 'aknEditorElementDialog';
	ElementDialog.static.size = 'large';
	ElementDialog.static.actions = [
		{ label: mw.msg( 'aknedit-cancel' ), flags: 'safe' }
	];

	ElementDialog.prototype.initialize = function () {
		ElementDialog.super.prototype.initialize.call( this );
		this.$fields = $( '<div>' );
		this.$attrs = $( '<div>' );
		var panel = new OO.ui.PanelLayout( { padded: true, expanded: false } );
		panel.$element.append(
			this.$fields,
			$( '<h4>' ).addClass( 'akn-editor-dialog-heading' ).text( mw.msg( 'aknedit-attr-heading' ) ),
			this.$attrs
		);
		this.$body.append( panel.$element );
	};

	/**
	 * @param {Element} el The structural element to edit.
	 * @param {OO.ui.OutlineOptionWidget} outlineItem Its outline row, relabelled live as num/heading change.
	 */
	ElementDialog.prototype.setElement = function ( el, outlineItem ) {
		var app = this.app;

		// eId is system-managed, not user-editable (see renderAttributeTable) — but every
		// structural element still needs one, so generate it lazily here if it's ever missing.
		if ( !el.getAttribute( 'eId' ) ) {
			el.setAttribute( 'eId', app.nextEid( el.localName ) );
		}

		function relabel() {
			outlineItem.setLabel( outlineLabel( el ) );
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

		// Pure containers (part/chapter/...) hold nested structural children, not their own
		// prose — per AKN's content model a hierarchical element has *either* children *or*
		// content, never both, and in this corpus containers only ever hold children. Showing
		// an always-empty content field on them would be misleading, so it's omitted entirely.
		if ( formConfigFor( el.localName ).content ) {
			var contentField = new RawContentField( app, function ( create ) {
				var content = firstChild( el, 'content' );
				if ( !content && create ) {
					content = app.doc.createElementNS( AKN_NS, 'content' );
					el.appendChild( content );
				}
				return content;
			} );

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
			// Prepended into the field's own body, right above the textarea it belongs to —
			// $field is FieldLayout's real, documented container for the field widget.
			contentLayout.$field.prepend( buildInlineToolbar( contentInput ) );

			items.push( contentLayout );
		}

		this.$fields.empty().append(
			new OO.ui.FieldsetLayout( { items: items } ).$element
		);
		this.$attrs.empty().append( app.renderAttributeTable( el ) );
	};

	ElementDialog.prototype.getBodyHeight = function () {
		return 500;
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

	$( function () {
		var $root = $( '#akn-editor-root' );
		if ( $root.length === 0 ) {
			return;
		}
		var app = new AknEditorApp( mw.config.get( 'wgAknEditorXml' ) || '' );
		if ( !app.root ) {
			$root.text( 'Unable to parse this document.' );
			return;
		}
		app.mount( $root );
	} );

}() );
