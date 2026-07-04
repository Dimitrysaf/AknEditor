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
	this.isGazette = !!this.root && this.root.localName === 'officialGazette';
	this.vocab = mw.config.get( 'wgAknVocabulary' ) || {};
	this.structureEls = [];
	this.eidCounter = 0;
	this.outlineGroup = null;
	this.activeElement = null;
	this.activeRow = null;
	this.elementPane = null;
	this.toolbar = null;
	this.refreshMetaFields = null;
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
	if ( this.refreshMetaFields ) {
		this.refreshMetaFields();
	}
	if ( this.toolbar ) {
		this.toolbar.emit( 'updateState' );
	}
};

/** Find-or-create an `<identification>` descendant chain under `<meta>`. */
AknEditorApp.prototype.frbrChild = function ( container, localName, create ) {
	if ( !this.meta ) {
		return null;
	}
	var ident = firstChild( this.meta, 'identification' );
	if ( !ident ) {
		return null;
	}
	var wrapper = firstChild( ident, container );
	if ( !wrapper ) {
		if ( !create ) {
			return null;
		}
		wrapper = this.doc.createElementNS( AKN_NS, container );
		ident.appendChild( wrapper );
	}
	var el = firstChild( wrapper, localName );
	if ( !el && create ) {
		el = this.doc.createElementNS( AKN_NS, localName );
		if ( localName === 'FRBRdate' ) {
			el.setAttribute( 'name', 'enacted' );
		}
		wrapper.appendChild( el );
	}
	return el;
};

AknEditorApp.prototype.identificationChild = function ( localName, create ) {
	return this.frbrChild( 'FRBRWork', localName, create );
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

/** Find-or-create a gazette's `<collectionBody>` — a direct child of the root, not of `<meta>`. */
AknEditorApp.prototype.collectionBodyEl = function ( create ) {
	if ( !this.root ) {
		return null;
	}
	var cb = firstChild( this.root, 'collectionBody' );
	if ( !cb && create ) {
		cb = this.doc.createElementNS( AKN_NS, 'collectionBody' );
		this.root.appendChild( cb );
	}
	return cb;
};

/** @return {Element[]} Every `<component>` embedded directly in the gazette's `<collectionBody>`. */
AknEditorApp.prototype.listGazetteComponents = function () {
	var cb = this.collectionBodyEl( false );
	if ( !cb ) {
		return [];
	}
	return Array.prototype.filter.call( cb.children, function ( el ) {
		return el.localName === 'component';
	} );
};

/** A short label for a gazette `<component>` — its embedded document's alias, or its tag name. */
AknEditorApp.prototype.gazetteComponentLabel = function ( componentEl ) {
	var akomaNtoso = firstChild( componentEl, 'akomaNtoso' );
	var innerRoot = akomaNtoso ? Array.prototype.filter.call( akomaNtoso.children, function ( child ) {
		return ROOT_TYPES.indexOf( child.localName ) !== -1;
	} )[ 0 ] : null;
	if ( !innerRoot ) {
		return componentEl.getAttribute( 'eId' ) || 'component';
	}
	var identification = firstChild( innerRoot, 'meta' );
	identification = identification ? firstChild( identification, 'identification' ) : null;
	var work = identification ? firstChild( identification, 'FRBRWork' ) : null;
	var alias = work ? firstChild( work, 'FRBRalias' ) : null;
	return ( alias && alias.getAttribute( 'value' ) ) || innerRoot.localName;
};

/** Find-or-create a direct `<meta>` child by tag name (`<references>`, `<classification>`, `<lifecycle>`). */
AknEditorApp.prototype.metaChild = function ( path, create ) {
	var app = this;
	var names = Array.isArray( path ) ? path : [ path ];
	var parent = this.meta;
	var el = null;
	names.forEach( function ( name ) {
		if ( !parent ) {
			el = null;
			return;
		}
		el = firstChild( parent, name );
		if ( !el && create ) {
			el = app.doc.createElementNS( AKN_NS, name );
			parent.appendChild( el );
		}
		parent = el;
	} );
	return el;
};

/** @return {Object[]} `{ eId, showAs }` for every `<meta><references>` entry. */
AknEditorApp.prototype.listReferences = function () {
	var refs = this.metaChild( 'references', false );
	if ( !refs ) {
		return [];
	}
	return Array.prototype.filter.call( refs.children, function ( el ) {
		return !!el.getAttribute( 'eId' );
	} ).map( function ( el ) {
		return { eId: el.getAttribute( 'eId' ), showAs: el.getAttribute( 'showAs' ) || el.getAttribute( 'eId' ) };
	} );
};

/** @return {Object[]} `{ eId, date, type }` for every `<meta><lifecycle><eventRef>` entry. */
AknEditorApp.prototype.listLifecycleEvents = function () {
	var lifecycle = this.metaChild( 'lifecycle', false );
	if ( !lifecycle ) {
		return [];
	}
	return Array.prototype.filter.call( lifecycle.children, function ( el ) {
		return el.localName === 'eventRef' && !!el.getAttribute( 'eId' );
	} ).map( function ( el ) {
		return {
			eId: el.getAttribute( 'eId' ),
			date: el.getAttribute( 'date' ) || '',
			type: el.getAttribute( 'type' ) || ''
		};
	} );
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

	function textField( fields, msgKey, field, required ) {
		var widget = new OO.ui.TextInputWidget( { value: field.get() } );
		widget.setRequired( !!required );
		widget.on( 'change', function ( value ) {
			field.set( value );
		} );
		fields.push( new OO.ui.FieldLayout( widget, {
			label: mw.msg( msgKey ),
			align: 'top'
		} ) );
	}

	function dropdownField( fields, msgKey, field, map, required ) {
		var widget = dropdown( map, field.get() );
		widget.setRequired( !!required );
		widget.on( 'change', function ( value ) {
			field.set( value );
		} );
		fields.push( new OO.ui.FieldLayout( widget, {
			label: mw.msg( msgKey ),
			align: 'top'
		} ) );
	}

	/** Same as textField, but for an actual calendar date — a real date picker, not free text. */
	function dateField( fields, msgKey, field, required ) {
		// $overlay: the Metadata dialog's own overlay (app.metaOverlay, set in mount()) — the
		// calendar escapes into it instead of trying to expand inside the dialog's own
		// (comparatively small) page body, while still painting above the dialog itself.
		var widget = new mw.widgets.DateInputWidget( { value: field.get(), $overlay: app.metaOverlay } );
		widget.setRequired( !!required );
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
	), true );
	dropdownField( identificationFields, 'aknedit-field-doctype', new AttrField(
		function () { return app.root; }, 'name'
	), vocab.docTypes, true );
	textField( identificationFields, 'aknedit-field-number', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRnumber', create ); }, 'value'
	), true );
	dateField( identificationFields, 'aknedit-field-enacted', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRdate', create ); }, 'date'
	), true );
	dropdownField( identificationFields, 'aknedit-field-country', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRcountry', create ); }, 'value'
	), vocab.countries, true );
	dropdownField( identificationFields, 'aknedit-field-language', new AttrField(
		function ( create ) { return app.frbrChild( 'FRBRExpression', 'FRBRlanguage', create ); }, 'language'
	), vocab.languages );
	dropdownField( identificationFields, 'aknedit-field-subtype', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRsubtype', create ); }, 'value'
	), vocab.docTypes );
	textField( identificationFields, 'aknedit-field-frbrname', new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRname', create ); }, 'value'
	) );
	dateField( identificationFields, 'aknedit-field-exprdate', new AttrField(
		function ( create ) { return app.frbrChild( 'FRBRExpression', 'FRBRdate', create ); }, 'date'
	) );
	textField( identificationFields, 'aknedit-field-manifuri', new AttrField(
		function ( create ) { return app.frbrChild( 'FRBRManifestation', 'FRBRuri', create ); }, 'value'
	) );

	var authorField = new AttrField(
		function ( create ) { return app.identificationChild( 'FRBRauthor', create ); }, 'href'
	);
	var authorMap = {};
	app.listReferences().forEach( function ( ref ) {
		authorMap[ '#' + ref.eId ] = ref.showAs;
	} );
	dropdownField( identificationFields, 'aknedit-field-author', authorField, authorMap );

	textField( publicationFields, 'aknedit-field-fek', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'showAs'
	) );
	textField( publicationFields, 'aknedit-field-fek-series', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'name'
	) );
	textField( publicationFields, 'aknedit-field-fek-number', new AttrField(
		function ( create ) { return app.publicationEl( create ); }, 'number'
	) );
	dateField( publicationFields, 'aknedit-field-fek-date', new AttrField(
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

	function isOutlineElement( el ) {
		return structureTypes.indexOf( el.localName ) !== -1 || el.localName === 'hcontainer';
	}

	function hasStructureChildren( el ) {
		return Array.prototype.some.call( el.children, isOutlineElement );
	}

	function walk( parent, level ) {
		Array.prototype.forEach.call( parent.children, function ( child ) {
			if ( !isOutlineElement( child ) ) {
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
	var hiddenAttrs = el.localName === 'hcontainer' ? [ 'eId', 'name', 'showAs' ] : [ 'eId' ];

	function row( nameInput, valueInput, actionButton ) {
		return $( '<div>' ).addClass( 'akn-editor-attr-row' ).append(
			nameInput.$element, valueInput.$element, actionButton.$element
		);
	}

	function render() {
		$rows.empty();
		Array.prototype.forEach.call( el.attributes, function ( attr ) {
			if ( hiddenAttrs.indexOf( attr.name ) !== -1 ) {
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
			if ( name === '' || hiddenAttrs.indexOf( name ) !== -1 ) {
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
 * Generic repeatable-row editor for a `<meta>` list block (`<references>`,
 * `<classification>`, `<lifecycle>`) — same add/remove interaction as renderAttributeTable,
 * generalized to N attribute columns per row instead of a fixed name/value pair.
 *
 * @param {string|string[]|Function} wrapperRef Direct `<meta>` child tag/path (resolved via
 *  `app.metaChild`), e.g. `'references'` or `[ 'analysis', 'activeModifications' ]` — or a
 *  `function ( create )` for wrappers that aren't `<meta>`-relative at all (e.g. a gazette's
 *  `<collectionBody>`, a direct child of the document root).
 * @param {string|string[]} rowTagNames Row element tag name(s); an array when rows can be
 *  more than one tag (e.g. `TLCOrganization`/`TLCPerson`) — the first is used for new rows.
 * @param {Object[]} fieldDefs Either `{ attr, msgKey, autoGenerate }` (a plain attribute
 *  column) or `{ kind: 'tagSelect', options }` (swaps the row's element tag on change).
 * @param {Function} [onChange] Called after any add/remove/tag-swap/attribute edit.
 * @return {jQuery}
 */
AknEditorApp.prototype.renderElementListEditor = function ( wrapperRef, rowTagNames, fieldDefs, onChange ) {
	var app = this;
	var tagNames = Array.isArray( rowTagNames ) ? rowTagNames : [ rowTagNames ];
	var $rows = $( '<div>' ).addClass( 'akn-editor-meta-list-rows' );

	function resolveWrapper( create ) {
		return typeof wrapperRef === 'function' ? wrapperRef( create ) : app.metaChild( wrapperRef, create );
	}

	function notify() {
		if ( onChange ) {
			onChange();
		}
	}

	function buildFieldWidget( def, el ) {
		if ( def.kind === 'tagSelect' ) {
			var dropdown = new OO.ui.DropdownInputWidget( { options: def.options, value: el.localName } );
			dropdown.on( 'change', function ( newTag ) {
				if ( newTag === el.localName ) {
					return;
				}
				var replacement = app.doc.createElementNS( AKN_NS, newTag );
				Array.prototype.forEach.call( el.attributes, function ( attr ) {
					replacement.setAttribute( attr.name, attr.value );
				} );
				el.parentNode.replaceChild( replacement, el );
				render();
				notify();
			} );
			return dropdown;
		}
		if ( def.kind === 'select' ) {
			var select = new OO.ui.DropdownInputWidget( {
				options: typeof def.options === 'function' ? def.options() : def.options,
				value: el.getAttribute( def.attr ) || ''
			} );
			select.on( 'change', function ( value ) {
				if ( value === '' ) {
					el.removeAttribute( def.attr );
				} else {
					el.setAttribute( def.attr, value );
				}
				notify();
			} );
			return select;
		}
		if ( def.kind === 'date' ) {
			var dateWidget = new mw.widgets.DateInputWidget( { value: el.getAttribute( def.attr ) || '', $overlay: app.metaOverlay } );
			dateWidget.on( 'change', function ( value ) {
				if ( value === '' ) {
					el.removeAttribute( def.attr );
				} else {
					el.setAttribute( def.attr, value );
				}
				notify();
			} );
			return dateWidget;
		}
		if ( def.kind === 'childAttr' ) {
			function childOf( create ) {
				var child = firstChild( el, def.childTag );
				if ( !child && create ) {
					child = app.doc.createElementNS( AKN_NS, def.childTag );
					el.appendChild( child );
				}
				return child;
			}
			var existingChild = childOf( false );
			var currentValue = existingChild ? existingChild.getAttribute( def.attr ) || '' : '';
			var options = typeof def.options === 'function' ? def.options() : def.options;
			var childWidget = options ?
				new OO.ui.DropdownInputWidget( { options: options, value: currentValue } ) :
				new OO.ui.TextInputWidget( { value: currentValue, placeholder: mw.msg( def.msgKey ) } );
			childWidget.on( 'change', function ( value ) {
				if ( value === '' ) {
					var child = childOf( false );
					if ( child ) {
						child.removeAttribute( def.attr );
					}
				} else {
					childOf( true ).setAttribute( def.attr, value );
				}
				notify();
			} );
			return childWidget;
		}
		var input = new OO.ui.TextInputWidget( { value: el.getAttribute( def.attr ) || '', placeholder: mw.msg( def.msgKey ) } );
		input.on( 'change', function ( value ) {
			if ( value === '' ) {
				el.removeAttribute( def.attr );
			} else {
				el.setAttribute( def.attr, value );
			}
			notify();
		} );
		return input;
	}

	function render() {
		$rows.empty();
		var wrapper = resolveWrapper( false );
		var items = wrapper ? Array.prototype.filter.call( wrapper.children, function ( child ) {
			return tagNames.indexOf( child.localName ) !== -1;
		} ) : [];

		items.forEach( function ( el ) {
			var removeButton = new OO.ui.ButtonWidget( {
				icon: 'trash',
				label: mw.msg( 'aknedit-attr-remove' ),
				invisibleLabel: true,
				framed: false,
				flags: [ 'destructive' ]
			} );
			removeButton.on( 'click', function () {
				el.parentNode.removeChild( el );
				render();
				notify();
			} );

			var $row = $( '<div>' ).addClass( 'akn-editor-meta-list-row' );
			fieldDefs.forEach( function ( def ) {
				$row.append( buildFieldWidget( def, el ).$element );
			} );
			$row.append( removeButton.$element );
			$rows.append( $row );
		} );

		var addButton = new OO.ui.ButtonWidget( { icon: 'add', label: mw.msg( 'aknedit-attr-add' ), invisibleLabel: true, framed: false } );
		addButton.on( 'click', function () {
			var wrapperEl = resolveWrapper( true );
			var newEl = app.doc.createElementNS( AKN_NS, tagNames[ 0 ] );
			fieldDefs.forEach( function ( def ) {
				if ( def.attr === 'eId' && def.autoGenerate ) {
					newEl.setAttribute( 'eId', def.autoGenerate() );
				}
			} );
			wrapperEl.appendChild( newEl );
			render();
			notify();
		} );
		$rows.append( $( '<div>' ).addClass( 'akn-editor-meta-list-row' ).append( addButton.$element ) );
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
		$( '<h3>' ).addClass( 'akn-editor-dialog-heading' ).text( mw.msg( 'aknedit-outline-heading' ) ),
		group.$element
	);

	this.$workspace = $( '<div>' ).addClass( 'akn-editor-workspace' ).append(
		$outlineCol,
		elementPane.$element
	);
	return this.$workspace;
};

/**
 * The gazette editing mode's workspace — no structural outline/element pane at all (a
 * gazette's `<collectionBody>` isn't made of STRUCTURE_TYPES elements), just a
 * `documentRef` list editor and a read-only `component` list.
 */
AknEditorApp.prototype.buildGazetteWorkspace = function () {
	var app = this;

	var $documentRefs = app.renderElementListEditor(
		function ( create ) { return app.collectionBodyEl( create ); },
		'documentRef',
		[
			{ attr: 'href', msgKey: 'aknedit-gazette-documentref-href' },
			{ attr: 'showAs', msgKey: 'aknedit-gazette-documentref-showas' }
		]
	);

	var $components = $( '<div>' ).addClass( 'akn-editor-meta-list-rows' );
	function renderComponents() {
		$components.empty();
		app.listGazetteComponents().forEach( function ( componentEl ) {
			var removeButton = new OO.ui.ButtonWidget( {
				icon: 'trash',
				label: mw.msg( 'aknedit-attr-remove' ),
				invisibleLabel: true,
				framed: false,
				flags: [ 'destructive' ]
			} );
			removeButton.on( 'click', function () {
				componentEl.parentNode.removeChild( componentEl );
				renderComponents();
			} );
			$components.append(
				$( '<div>' ).addClass( 'akn-editor-meta-list-row' ).append(
					$( '<span>' ).text( app.gazetteComponentLabel( componentEl ) ),
					removeButton.$element
				)
			);
		} );
	}
	renderComponents();

	return $( '<div>' ).addClass( 'akn-editor-gazette-workspace' ).append(
		$( '<h3>' ).addClass( 'akn-editor-dialog-heading' ).text( mw.msg( 'aknedit-gazette-documentrefs-heading' ) ),
		$documentRefs,
		$( '<h3>' ).addClass( 'akn-editor-dialog-heading' ).text( mw.msg( 'aknedit-gazette-components-heading' ) ),
		$components
	);
};

/** Structural sanity check — not full AKN/RelaxNG schema validation, see plan notes. */
AknEditorApp.prototype.runValidation = function () {
	var app = this;
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
	var identification = this.meta ? firstChild( this.meta, 'identification' ) : null;
	var hasWork = !!identification && !!firstChild( identification, 'FRBRWork' );
	if ( !hasWork ) {
		issues.push( mw.msg( 'aknedit-validate-missing-meta' ) );
	} else if ( !this.isGazette ) {
		[
			{ get: function () { return app.root ? app.root.getAttribute( 'name' ) : ''; }, msgKey: 'aknedit-field-doctype' },
			{ get: function () { var el = app.identificationChild( 'FRBRalias', false ); return el ? el.getAttribute( 'value' ) : ''; }, msgKey: 'aknedit-field-alias' },
			{ get: function () { var el = app.identificationChild( 'FRBRnumber', false ); return el ? el.getAttribute( 'value' ) : ''; }, msgKey: 'aknedit-field-number' },
			{ get: function () { var el = app.identificationChild( 'FRBRdate', false ); return el ? el.getAttribute( 'date' ) : ''; }, msgKey: 'aknedit-field-enacted' },
			{ get: function () { var el = app.identificationChild( 'FRBRcountry', false ); return el ? el.getAttribute( 'value' ) : ''; }, msgKey: 'aknedit-field-country' }
		].forEach( function ( check ) {
			if ( !check.get() ) {
				issues.push( mw.msg( 'aknedit-validate-missing-field', mw.msg( check.msgKey ) ) );
			}
		} );
	}
	if ( !this.isGazette && ( !this.body || this.body.children.length === 0 ) ) {
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
	var refDialog = new RefDialog();
	var attrValueDialog = new AttrValueDialog();
	windowManager.addWindows( [ saveDialog, metadataDialog, refDialog, attrValueDialog ] );
	app.windowManager = windowManager;
	app.refDialog = refDialog;
	app.attrValueDialog = attrValueDialog;
	// The dialog's own overlay (every OO.ui.Window has one) — not OO.ui.getDefaultOverlay(),
	// which has no z-index of its own and so doesn't reliably paint above an open modal. Used
	// by dateField/renderElementListEditor's date fields so their calendars aren't stuck
	// behind the Metadata dialog.
	app.metaOverlay = metadataDialog.$overlay;
	var elementPane = app.isGazette ? null : new ElementPane( app );

	function refreshMetaFields() {
		var metaFields = app.buildMetaFields();
		metadataDialog.setFields( metaFields.identification, metaFields.publication );
		metadataDialog.referencesPage.setContent( app.renderElementListEditor(
			'references', [ 'TLCOrganization', 'TLCPerson' ],
			[
				{ kind: 'tagSelect', options: [
					{ data: 'TLCOrganization', label: mw.msg( 'aknedit-reference-type-organization' ) },
					{ data: 'TLCPerson', label: mw.msg( 'aknedit-reference-type-person' ) }
				] },
				{ attr: 'eId', msgKey: 'aknedit-reference-eid', autoGenerate: function () { return app.nextEid( 'ref' ); } },
				{ attr: 'showAs', msgKey: 'aknedit-reference-showas' },
				{ attr: 'href', msgKey: 'aknedit-reference-href' }
			],
			refreshMetaFields
		) );
		metadataDialog.classificationPage.setContent( app.renderElementListEditor(
			'classification', 'keyword',
			[
				{ attr: 'dictionary', msgKey: 'aknedit-classification-dictionary' },
				{ attr: 'value', msgKey: 'aknedit-classification-value' },
				{ attr: 'showAs', msgKey: 'aknedit-classification-showas' },
				{ attr: 'href', msgKey: 'aknedit-classification-href' }
			]
		) );
		metadataDialog.lifecyclePage.setContent( app.renderElementListEditor(
			'lifecycle', 'eventRef',
			[
				{ attr: 'eId', msgKey: 'aknedit-lifecycle-eid', autoGenerate: function () { return app.nextEid( 'event' ); } },
				{ kind: 'date', attr: 'date', msgKey: 'aknedit-lifecycle-date' },
				{ attr: 'type', msgKey: 'aknedit-lifecycle-type' },
				{ attr: 'source', msgKey: 'aknedit-lifecycle-source' }
			]
		) );

		function textualModFieldDefs() {
			return [
				{ kind: 'select', attr: 'type', options: [
					{ data: '', label: '—' },
					{ data: 'repeal', label: mw.msg( 'aknedit-amendment-type-repeal' ) },
					{ data: 'substitution', label: mw.msg( 'aknedit-amendment-type-substitution' ) },
					{ data: 'insertion', label: mw.msg( 'aknedit-amendment-type-insertion' ) },
					{ data: 'replacement', label: mw.msg( 'aknedit-amendment-type-replacement' ) },
					{ data: 'renumbering', label: mw.msg( 'aknedit-amendment-type-renumbering' ) },
					{ data: 'split', label: mw.msg( 'aknedit-amendment-type-split' ) },
					{ data: 'join', label: mw.msg( 'aknedit-amendment-type-join' ) }
				] },
				{ kind: 'childAttr', childTag: 'source', attr: 'href', msgKey: 'aknedit-amendment-source' },
				{ kind: 'childAttr', childTag: 'destination', attr: 'href', msgKey: 'aknedit-amendment-destination' },
				{ kind: 'childAttr', childTag: 'force', attr: 'period', msgKey: 'aknedit-amendment-force', options: function () {
					var options = app.listLifecycleEvents().map( function ( ev ) {
						return { data: '#' + ev.eId, label: ( ev.type || ev.eId ) + ( ev.date ? ' ' + ev.date : '' ) + ' (' + ev.eId + ')' };
					} );
					options.unshift( { data: '', label: '—' } );
					return options;
				} }
			];
		}

		metadataDialog.amendmentsPage.setContent( $( '<div>' ).append(
			$( '<h4>' ).addClass( 'akn-editor-dialog-heading' ).text( mw.msg( 'aknedit-amendment-active-heading' ) ),
			app.renderElementListEditor( [ 'analysis', 'activeModifications' ], 'textualMod', textualModFieldDefs() ),
			$( '<h4>' ).addClass( 'akn-editor-dialog-heading' ).text( mw.msg( 'aknedit-amendment-passive-heading' ) ),
			app.renderElementListEditor( [ 'analysis', 'passiveModifications' ], 'textualMod', textualModFieldDefs() )
		) );
	}
	refreshMetaFields();
	app.refreshMetaFields = refreshMetaFields;

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

	registerHistoryTools( toolFactory, app );
	registerTool( toolFactory, 'validate', 'check', 'aknedit-tool-validate', function () { app.showValidation(); }, true );
	registerTool( toolFactory, 'metadata', 'tag', 'aknedit-tool-metadata', function () { windowManager.openWindow( metadataDialog ); }, true );

	var toolbarGroups = [
		{ name: 'history', type: 'bar', include: [ 'undo', 'redo' ] },
		{ name: 'page', type: 'bar', include: [ 'validate', 'metadata' ] }
	];
	if ( !app.isGazette ) {
		var addToolNames = registerAddTools( toolFactory, app );
		toolbarGroups.unshift( {
			name: 'add',
			type: 'list',
			icon: 'add',
			invisibleLabel: false,
			label: mw.msg( 'aknedit-tool-add' ),
			include: addToolNames
		} );
	}
	toolbar.setup( toolbarGroups );
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

	var $workspace = app.isGazette ? app.buildGazetteWorkspace() : app.buildWorkspace( elementPane );

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
