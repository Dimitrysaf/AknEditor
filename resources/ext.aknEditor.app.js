'use strict';

function AknEditorApp( xmlText ) {
	this.doc = new DOMParser().parseFromString( xmlText, 'application/xml' );
	this.root = findRoot( this.doc );
	this.meta = this.root ? firstChild( this.root, 'meta' ) : null;
	this.body = this.root ? firstChild( this.root, 'body' ) : null;
	this.isGazette = !!this.root && this.root.localName === 'officialGazette';
	this.vocab = mw.config.get( 'wgAknVocabulary' ) || {};
	this.displayTypes = AKN_DISPLAY_TYPES;
	this.eidCounter = 0;
	this.outlineGroup = null;
	this.refreshMetaFields = null;
	this.collapsedElements = new Set();
	this.selectedEl = null;
	this.inlineEditor = null;
	this.pendingEditEid = null;
	this.pendingSelectEid = null;
	this.renderToken = 0;
	this.zoom = 1;
	this.dirty = false;

	this.aknInlineToolbarPlugin = buildAknInlineToolbarPlugin( this );
	this.aknRefPickerPlugin = buildAknRefPickerPlugin( this );
	this.aknTablePlugin = buildAknTablePlugin();
	this.aknBlockListPlugin = buildAknBlockListPlugin();
	this.aknQuotedStructurePlugin = buildAknQuotedStructurePlugin();

	if ( this.body && !this.isGazette ) {
		aknAutoNumber( this.doc, this.body );
	}
}

AknEditorApp.prototype.isStructural = function ( el ) {
	return !!el && el.nodeType === 1 && this.displayTypes.indexOf( el.localName ) !== -1;
};

AknEditorApp.prototype.markDirty = function () {
	this.dirty = true;
};

AknEditorApp.prototype.byEid = function ( eid ) {
	if ( !eid ) {
		return null;
	}
	var found = null;
	( function walk( parent ) {
		for ( var i = 0; i < parent.children.length && !found; i++ ) {
			var child = parent.children[ i ];
			if ( child.getAttribute( 'eId' ) === eid ) {
				found = child;
				return;
			}
			walk( child );
		}
	}( this.doc ) );
	return found;
};

AknEditorApp.prototype.editableUnitFor = function ( el ) {
	var node = el;
	while ( node && node !== this.body && node.nodeType === 1 ) {
		if ( node.localName === 'article' ) {
			return node;
		}
		node = node.parentNode;
	}
	return null;
};

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

AknEditorApp.prototype.documentAlias = function () {
	var alias = this.identificationChild( 'FRBRalias', false );
	return alias ? alias.getAttribute( 'value' ) || '' : '';
};

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

AknEditorApp.prototype.listGazetteComponents = function () {
	var cb = this.collectionBodyEl( false );
	if ( !cb ) {
		return [];
	}
	return Array.prototype.filter.call( cb.children, function ( el ) {
		return el.localName === 'component';
	} );
};

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
			app.markDirty();
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
			app.markDirty();
		} );
		fields.push( new OO.ui.FieldLayout( widget, {
			label: mw.msg( msgKey ),
			align: 'top'
		} ) );
	}

	function dateField( fields, msgKey, field, required ) {
		var widget = new mw.widgets.DateInputWidget( { value: field.get(), $overlay: app.metaOverlay } );
		widget.setRequired( !!required );
		widget.on( 'change', function ( value ) {
			field.set( value );
			app.markDirty();
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

AknEditorApp.prototype.nextEid = function ( type ) {
	var app = this;

	function existsInInlineEditor( candidate ) {
		if ( !app.inlineEditor ) {
			return false;
		}
		var found = false;
		( function walk( node ) {
			if ( found || !node.getChildren ) {
				return;
			}
			Array.from( node.getChildren() ).forEach( function ( child ) {
				if ( found ) {
					return;
				}
				if ( child.is && child.is( 'element' ) && child.getAttribute( 'eId' ) === candidate ) {
					found = true;
					return;
				}
				walk( child );
			} );
		}( app.inlineEditor.handle.editor.model.document.getRoot() ) );
		return found;
	}

	var candidate;
	do {
		this.eidCounter++;
		candidate = type + '_new_' + this.eidCounter;
	} while ( this.doc.querySelector( '[eId="' + candidate + '"]' ) || existsInInlineEditor( candidate ) );
	return candidate;
};

AknEditorApp.prototype.refreshOutline = function () {
	var app = this;
	var group = this.outlineGroup;
	if ( !group ) {
		return;
	}
	if ( this.isGazette ) {
		group.clearItems();
		group.addItems( ( this.collectionBodyEl( false ) ?
			Array.prototype.slice.call( this.collectionBodyEl( false ).children ) : [] )
			.filter( function ( child ) {
				return child.localName === 'documentRef' || child.localName === 'component';
			} )
			.map( function ( child, index ) {
				var label = child.localName === 'documentRef' ?
					( child.getAttribute( 'showAs' ) || child.getAttribute( 'href' ) || 'documentRef' ) :
					app.gazetteComponentLabel( child );
				var row = new OutlineRow( child, label, 0, false, false );
				row.on( 'select', function () {
					var item = app.$pages.find( '.akn-gazette-item' ).eq( index )[ 0 ];
					if ( item ) {
						item.scrollIntoView( { behavior: 'smooth', block: 'center' } );
						item.classList.add( 'akn-editor-highlight' );
						setTimeout( function () {
							item.classList.remove( 'akn-editor-highlight' );
						}, 1500 );
					}
				} );
				return row;
			} ) );
		return;
	}
	if ( !this.body ) {
		return;
	}
	var rows = [];

	function structuralChildren( el ) {
		return Array.prototype.filter.call( el.children, function ( child ) {
			return app.isStructural( child );
		} );
	}

	function walk( parent, level ) {
		structuralChildren( parent ).forEach( function ( child ) {
			var children = structuralChildren( child );
			var hasChildren = children.length > 0;
			var collapsed = hasChildren && app.collapsedElements.has( child );
			var row = new OutlineRow( child, outlineLabel( child ), level, hasChildren, collapsed );
			row.on( 'select', function () {
				app.selectElement( child );
				app.scrollToEid( child.getAttribute( 'eId' ) );
			} );
			row.on( 'togglecollapse', function () {
				if ( app.collapsedElements.has( child ) ) {
					app.collapsedElements.delete( child );
				} else {
					app.collapsedElements.add( child );
				}
				app.refreshOutline();
			} );
			row.setActive( child === app.selectedEl );
			rows.push( row );
			if ( !collapsed ) {
				walk( child, level + 1 );
			}
		} );
	}

	group.clearItems();
	walk( this.body, 0 );
	group.addItems( rows );
};

AknEditorApp.prototype.listStructureElements = function () {
	var app = this;
	var entries = [];
	if ( !this.body ) {
		return entries;
	}
	( function walk( parent ) {
		Array.prototype.forEach.call( parent.children, function ( child ) {
			if ( app.isStructural( child ) ) {
				var eId = child.getAttribute( 'eId' );
				if ( eId ) {
					var num = firstChild( child, 'num' );
					var heading = firstChild( child, 'heading' );
					var label = outlineLabel( child );
					var detail = [ num && num.textContent.trim(), heading && heading.textContent.trim() ]
						.filter( function ( part ) { return !!part; } ).join( ' — ' );
					entries.push( { eId: eId, label: detail || label } );
				}
			}
			walk( child );
		} );
	}( this.body ) );
	return entries;
};

AknEditorApp.prototype.renderedParts = function ( eid ) {
	return this.$pages.find(
		'[id="' + $.escapeSelector( eid ) + '"], [data-akn-part-of="' + $.escapeSelector( eid ) + '"]'
	);
};

AknEditorApp.prototype.scrollToEid = function ( eid ) {
	if ( !eid ) {
		return;
	}
	var $parts = this.renderedParts( eid );
	if ( !$parts.length ) {
		return;
	}
	var domElement = $parts[ 0 ];
	domElement.scrollIntoView( { behavior: 'smooth', block: 'center' } );
	domElement.classList.add( 'akn-editor-highlight' );
	setTimeout( function () {
		domElement.classList.remove( 'akn-editor-highlight' );
	}, 1500 );
};

AknEditorApp.prototype.applySelectionHighlight = function () {
	var app = this;
	this.$pages.find( '.akn-editor-target-selected, .akn-editor-target-selected-container' )
		.removeClass( 'akn-editor-target-selected akn-editor-target-selected-container' );
	if ( this.selectedEl ) {
		var eid = this.selectedEl.getAttribute( 'eId' );
		if ( eid ) {
			this.renderedParts( eid ).addClass(
				this.selectedEl.localName === 'article' ?
					'akn-editor-target-selected' :
					'akn-editor-target-selected-container'
			);
		}
	}
	if ( this.outlineGroup ) {
		this.outlineGroup.getItems().forEach( function ( row ) {
			row.setActive( row.el === app.selectedEl );
		} );
	}
};

AknEditorApp.prototype.selectElement = function ( xmlEl ) {
	this.selectedEl = xmlEl;
	this.applySelectionHighlight();
	if ( this.selectedElementPanel ) {
		this.selectedElementPanel.refresh( this );
	}
};

AknEditorApp.prototype.childText = function ( el, tag ) {
	var child = firstChild( el, tag );
	return child ? child.textContent : '';
};

AknEditorApp.prototype.setChildText = function ( el, tag, value ) {
	var child = firstChild( el, tag );
	if ( !child ) {
		if ( !value ) {
			return;
		}
		child = this.doc.createElementNS( AKN_NS, tag );
		if ( tag === 'num' ) {
			el.insertBefore( child, el.firstChild );
		} else {
			var num = firstChild( el, 'num' );
			el.insertBefore( child, num ? num.nextSibling : el.firstChild );
		}
	}
	child.textContent = value;
	this.markDirty();
};

AknEditorApp.prototype.paginate = function ( blocks ) {
	var $pages = this.$pages;
	$pages.empty();
	var pageEl = null;
	var contentEl = null;
	var shellStack = [];

	function newPage() {
		var $page = $( '<div>' ).addClass( 'akn-editor-page' ).append(
			$( '<div>' ).addClass( 'akn-editor-page-content akn-document' )
		);
		$pages.append( $page );
		pageEl = $page[ 0 ];
		contentEl = pageEl.firstChild;
		var parent = contentEl;
		shellStack = shellStack.map( function ( shell ) {
			var clone = shell.cloneNode( false );
			if ( clone.id ) {
				clone.setAttribute( 'data-akn-part-of', clone.id );
				clone.removeAttribute( 'id' );
			}
			parent.appendChild( clone );
			parent = clone;
			return clone;
		} );
	}

	function target() {
		return shellStack.length ? shellStack[ shellStack.length - 1 ] : contentEl;
	}

	function overflows() {
		return pageEl.scrollHeight > pageEl.clientHeight + 1;
	}

	function place( node ) {
		target().appendChild( node );
		if ( !overflows() ) {
			return;
		}
		target().removeChild( node );
		var splittable = node.nodeType === 1 && node.tagName === 'SECTION' && node.children.length > 1;
		if ( !splittable ) {
			newPage();
			target().appendChild( node );
			return;
		}
		var shell = node.cloneNode( false );
		target().appendChild( shell );
		shellStack.push( shell );
		Array.prototype.slice.call( node.childNodes ).forEach( place );
		shellStack.pop();
	}

	newPage();
	blocks.forEach( place );
};

AknEditorApp.prototype.setZoom = function ( zoom ) {
	this.zoom = Math.min( 2, Math.max( 0.5, Math.round( zoom * 10 ) / 10 ) );
	this.$pages.css( 'zoom', this.zoom );
	if ( this.$zoomLabel ) {
		this.$zoomLabel.text( Math.round( this.zoom * 100 ) + '%' );
	}
};

AknEditorApp.prototype.renderDocument = function () {
	var app = this;
	var token = ++this.renderToken;
	this.$document.addClass( 'akn-editor-rendering' );
	return new mw.Api().post( {
		action: 'parse',
		formatversion: 2,
		title: mw.config.get( 'wgAknEditorTitle' ),
		text: new XMLSerializer().serializeToString( this.doc ),
		contentmodel: 'akn-xml',
		contentformat: 'application/xml',
		prop: 'text',
		disablelimitreport: 1
	} ).done( function ( result ) {
		if ( token !== app.renderToken ) {
			return;
		}
		var $html = $( '<div>' ).html( ( result.parse && result.parse.text ) || '' );
		$html.find( 'meta, link, #toc, .toc' ).remove();
		var $docRoot = $html.find( '.akn-document' ).first();
		var blocks = ( $docRoot.length ? $docRoot : $html ).children().toArray();
		var scrollTop = app.$document.scrollTop();
		app.paginate( blocks );
		app.$document.scrollTop( scrollTop );
		app.refreshOutline();

		var pendingSelect = app.pendingSelectEid;
		app.pendingSelectEid = null;
		if ( pendingSelect ) {
			var selectEl = app.byEid( pendingSelect );
			if ( selectEl ) {
				app.selectElement( selectEl );
				app.scrollToEid( pendingSelect );
			}
		} else {
			app.applySelectionHighlight();
			if ( app.selectedElementPanel ) {
				app.selectedElementPanel.refresh( app );
			}
		}

		var pendingEdit = app.pendingEditEid;
		app.pendingEditEid = null;
		if ( pendingEdit ) {
			var editEl = app.byEid( pendingEdit );
			if ( editEl ) {
				app.mountInlineEditor( editEl );
			}
		}
	} ).fail( function ( code, result ) {
		if ( token !== app.renderToken ) {
			return;
		}
		OO.ui.alert( mw.msg( 'aknedit-render-error', apiErrorDetail( code, result ) ) );
	} ).always( function () {
		if ( token === app.renderToken ) {
			app.$document.removeClass( 'akn-editor-rendering' );
		}
	} );
};

AknEditorApp.prototype.mountInlineEditor = function ( xmlEl ) {
	var app = this;
	if ( this.inlineEditor ) {
		return;
	}
	var eid = xmlEl.getAttribute( 'eId' );
	var $parts = this.renderedParts( eid );
	if ( !$parts.length ) {
		return;
	}
	var $page = $parts.first().closest( '.akn-editor-page' ).addClass( 'akn-editor-page-editing' );

	var saveButton = new OO.ui.ButtonWidget( {
		icon: 'check',
		label: mw.msg( 'aknedit-element-save' ),
		flags: [ 'primary', 'progressive' ]
	} );
	var cancelButton = new OO.ui.ButtonWidget( { icon: 'close', label: mw.msg( 'aknedit-cancel' ) } );
	saveButton.on( 'click', function () {
		app.commitInlineEditor( true );
	} );
	cancelButton.on( 'click', function () {
		app.discardInlineEditor();
	} );

	var $editorHost = $( '<div>' ).addClass( 'akn-editor-inline-host' );
	var $container = $( '<div>' ).addClass( 'akn-editor-inline' ).append(
		$( '<div>' ).addClass( 'akn-editor-inline-actions' ).append( saveButton.$element, cancelButton.$element ),
		$editorHost
	);
	$container.insertBefore( $parts.first() );
	$parts.addClass( 'akn-editor-hidden-part' );

	var xml = aknArticleToEditorXml( xmlEl );
	createAknElementEditor( this, $editorHost[ 0 ], xml ).then( function ( handle ) {
		app.inlineEditor = { handle: handle, xmlEl: xmlEl, eid: eid, $container: $container, $parts: $parts, $page: $page };
		handle.editor.editing.view.focus();
	} ).catch( function ( error ) {
		mw.log.error( 'AknEditor: failed to create the element editor', error );
		$container.remove();
		$parts.removeClass( 'akn-editor-hidden-part' );
		$page.removeClass( 'akn-editor-page-editing' );
	} );
};

AknEditorApp.prototype.teardownInlineEditor = function () {
	var ie = this.inlineEditor;
	if ( !ie ) {
		return;
	}
	this.inlineEditor = null;
	ie.handle.editor.destroy().catch( function () {} );
	ie.$container.remove();
	ie.$parts.removeClass( 'akn-editor-hidden-part' );
	ie.$page.removeClass( 'akn-editor-page-editing' );
};

AknEditorApp.prototype.commitInlineEditor = function ( rerender ) {
	var app = this;
	var ie = this.inlineEditor;
	if ( !ie ) {
		return;
	}
	var data = ie.handle.editor.getData();
	var parsed = new DOMParser().parseFromString( '<body xmlns="' + AKN_NS + '">' + data + '</body>', 'application/xml' );
	if ( parsed.getElementsByTagName( 'parsererror' ).length ) {
		OO.ui.alert( mw.msg( 'aknedit-render-error', 'invalid XML' ) );
		return;
	}
	aknEditorListsToAkn( parsed, parsed.documentElement );
	this.markDirty();
	var parent = ie.xmlEl.parentNode;
	Array.prototype.slice.call( parsed.documentElement.childNodes ).forEach( function ( node ) {
		parent.insertBefore( app.doc.importNode( node, true ), ie.xmlEl );
	} );
	parent.removeChild( ie.xmlEl );
	aknAutoNumber( this.doc, this.body );
	if ( this.selectedEl === ie.xmlEl ) {
		this.selectedEl = null;
		this.pendingSelectEid = ie.eid;
	}
	this.teardownInlineEditor();
	if ( rerender !== false ) {
		this.renderDocument();
	}
};

AknEditorApp.prototype.discardInlineEditor = function () {
	this.teardownInlineEditor();
};

AknEditorApp.prototype.onDocumentClick = function ( e ) {
	if ( $( e.target ).closest( '.akn-editor-inline' ).length ) {
		return;
	}
	var node = e.target;
	var el = null;
	var pagesRoot = this.$pages[ 0 ];
	while ( node && node !== pagesRoot ) {
		if ( node.nodeType === 1 ) {
			var eid = node.getAttribute( 'data-akn-part-of' ) || node.id;
			if ( eid ) {
				var candidate = this.byEid( eid );
				if ( candidate && this.isStructural( candidate ) ) {
					el = candidate;
					break;
				}
			}
		}
		node = node.parentNode;
	}
	if ( !el ) {
		return;
	}
	var unit = this.editableUnitFor( el );
	if ( this.inlineEditor ) {
		if ( unit === this.inlineEditor.xmlEl ) {
			return;
		}
		var targetEid = ( unit || el ).getAttribute( 'eId' );
		this.pendingSelectEid = targetEid;
		this.pendingEditEid = unit ? targetEid : null;
		this.commitInlineEditor( true );
		return;
	}
	this.selectElement( unit || el );
	if ( unit ) {
		this.mountInlineEditor( unit );
	}
};

AknEditorApp.prototype.insertionPointFor = function ( type ) {
	var rank = this.displayTypes.indexOf( type );
	var anchor = this.selectedEl;
	if ( !anchor || !anchor.parentNode ) {
		return { parent: this.body, before: null };
	}
	var node = anchor;
	while ( node && node !== this.body ) {
		var nodeRank = this.displayTypes.indexOf( node.localName );
		if ( nodeRank === rank ) {
			return { parent: node.parentNode, before: node.nextSibling };
		}
		if ( nodeRank !== -1 && nodeRank < rank ) {
			var childAnchor = anchor;
			while ( childAnchor.parentNode !== node ) {
				childAnchor = childAnchor.parentNode;
			}
			return { parent: node, before: childAnchor.nextSibling };
		}
		node = node.parentNode;
	}
	return { parent: this.body, before: null };
};

AknEditorApp.prototype.insertElement = function ( type ) {
	if ( !this.body ) {
		return;
	}
	this.commitInlineEditor( false );
	var el = this.doc.createElementNS( AKN_NS, type );
	el.appendChild( this.doc.createElementNS( AKN_NS, 'num' ) );
	el.appendChild( this.doc.createElementNS( AKN_NS, 'heading' ) );
	if ( type === 'article' ) {
		var paragraph = this.doc.createElementNS( AKN_NS, 'paragraph' );
		var content = this.doc.createElementNS( AKN_NS, 'content' );
		content.appendChild( this.doc.createElementNS( AKN_NS, 'p' ) );
		paragraph.appendChild( this.doc.createElementNS( AKN_NS, 'num' ) );
		paragraph.appendChild( content );
		el.appendChild( paragraph );
	}
	var point = this.insertionPointFor( type );
	point.parent.insertBefore( el, point.before );
	this.markDirty();
	aknAutoNumber( this.doc, this.body );
	var eid = el.getAttribute( 'eId' );
	this.pendingSelectEid = eid;
	if ( type === 'article' ) {
		this.pendingEditEid = eid;
	}
	this.renderDocument();
};

AknEditorApp.prototype.moveElement = function ( xmlEl, direction ) {
	var parent = xmlEl.parentNode;
	if ( !parent ) {
		return;
	}
	var sibling = direction < 0 ? xmlEl.previousElementSibling : xmlEl.nextElementSibling;
	while ( sibling && !this.isStructural( sibling ) ) {
		sibling = direction < 0 ? sibling.previousElementSibling : sibling.nextElementSibling;
	}
	if ( !sibling ) {
		return;
	}
	parent.insertBefore( xmlEl, direction < 0 ? sibling : sibling.nextSibling );
	this.markDirty();
	aknAutoNumber( this.doc, this.body );
	this.pendingSelectEid = xmlEl.getAttribute( 'eId' );
	this.renderDocument();
};

AknEditorApp.prototype.removeElement = function ( xmlEl ) {
	var app = this;
	OO.ui.confirm( mw.msg( 'aknedit-remove-confirm' ) ).done( function ( confirmed ) {
		if ( !confirmed || !xmlEl.parentNode ) {
			return;
		}
		xmlEl.parentNode.removeChild( xmlEl );
		app.markDirty();
		if ( app.selectedEl === xmlEl ) {
			app.selectedEl = null;
		}
		aknAutoNumber( app.doc, app.body );
		app.renderDocument();
	} );
};

AknEditorApp.prototype.renderElementListEditor = function ( wrapperRef, rowTagNames, fieldDefs, onChange ) {
	var app = this;
	var tagNames = Array.isArray( rowTagNames ) ? rowTagNames : [ rowTagNames ];
	var $rows = $( '<div>' ).addClass( 'akn-editor-meta-list-rows' );

	function resolveWrapper( create ) {
		return typeof wrapperRef === 'function' ? wrapperRef( create ) : app.metaChild( wrapperRef, create );
	}

	function notify() {
		app.markDirty();
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

AknEditorApp.prototype.buildNavigationPane = function () {
	var group = new OutlineGroup();
	this.outlineGroup = group;
	this.selectedElementPanel = this.buildSelectedElementPanel();

	return $( '<div>' ).addClass( 'akn-editor-pane' ).append(
		$( '<div>' ).addClass( 'akn-editor-outline-scroll' ).append(
			$( '<h3>' ).addClass( 'akn-editor-pane-heading' ).text( mw.msg( 'aknedit-outline-heading' ) ),
			group.$element
		),
		this.selectedElementPanel.$element
	);
};

AknEditorApp.prototype.buildElementsPanel = function () {
	var app = this;
	var types = this.displayTypes;
	var $buttons = $( '<div>' ).addClass( 'akn-editor-elements-buttons' );
	types.forEach( function ( type ) {
		var button = new OO.ui.ButtonWidget( { label: elementTypeLabel( type ) } );
		button.on( 'click', function () {
			app.insertElement( type );
		} );
		$buttons.append( button.$element );
	} );

	var hideButton = new OO.ui.ButtonWidget( {
		icon: 'previous',
		label: mw.msg( 'aknedit-elements-hide' ),
		invisibleLabel: true,
		framed: false
	} );
	var $panel = $( '<div>' ).addClass( 'akn-editor-elements' ).append(
		$( '<div>' ).addClass( 'akn-editor-elements-header' ).append(
			$( '<h3>' ).addClass( 'akn-editor-pane-heading' ).text( mw.msg( 'aknedit-elements-heading' ) ),
			hideButton.$element
		),
		$buttons
	);

	var showButton = new OO.ui.ButtonWidget( {
		icon: 'next',
		label: mw.msg( 'aknedit-elements-show' ),
		invisibleLabel: true,
		framed: false
	} );
	var $expand = $( '<div>' ).addClass( 'akn-editor-elements-expand' ).append( showButton.$element ).hide();

	hideButton.on( 'click', function () {
		$panel.hide();
		$expand.show();
	} );
	showButton.on( 'click', function () {
		$expand.hide();
		$panel.show();
	} );

	return { $panel: $panel, $expand: $expand };
};

AknEditorApp.prototype.buildSelectedElementPanel = function () {
	var $content = $( '<div>' ).addClass( 'akn-editor-selected-content' );
	var $panel = $( '<div>' ).addClass( 'akn-editor-selected' ).append(
		$( '<h3>' ).addClass( 'akn-editor-pane-heading' ).text( mw.msg( 'aknedit-selected-heading' ) ),
		$content
	);

	function refresh( app ) {
		var el = app.selectedEl;
		$content.empty();
		if ( !el ) {
			$content.text( mw.msg( 'aknedit-selected-none' ) );
			return;
		}
		var rerender = mw.util.debounce( function () {
			app.renderDocument();
		}, 800 );

		var typeInput = new OO.ui.TextInputWidget( {
			value: elementTypeLabel( el.localName ) + ' — ' + app.childText( el, 'num' ),
			disabled: true
		} );
		var headingInput = new OO.ui.TextInputWidget( { value: app.childText( el, 'heading' ) } );
		headingInput.on( 'change', function ( value ) {
			app.setChildText( el, 'heading', value );
			rerender();
		} );

		var upButton = new OO.ui.ButtonWidget( { icon: 'upTriangle', label: mw.msg( 'aknedit-tool-moveup' ) } );
		upButton.on( 'click', function () {
			app.moveElement( el, -1 );
		} );
		var downButton = new OO.ui.ButtonWidget( { icon: 'downTriangle', label: mw.msg( 'aknedit-tool-movedown' ) } );
		downButton.on( 'click', function () {
			app.moveElement( el, 1 );
		} );
		var removeButton = new OO.ui.ButtonWidget( {
			label: mw.msg( 'aknedit-tool-remove' ), icon: 'trash', flags: [ 'destructive' ]
		} );
		removeButton.on( 'click', function () {
			app.removeElement( el );
		} );

		$content.append(
			new OO.ui.FieldLayout( typeInput, { label: mw.msg( 'aknedit-field-type' ), align: 'top' } ).$element,
			new OO.ui.FieldLayout( headingInput, { label: mw.msg( 'aknedit-field-heading' ), align: 'top' } ).$element,
			$( '<div>' ).addClass( 'akn-editor-selected-actions' ).append(
				upButton.$element, downButton.$element, removeButton.$element
			)
		);
	}

	$content.text( mw.msg( 'aknedit-selected-none' ) );
	return { $element: $panel, refresh: refresh };
};

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
		$( '<h3>' ).addClass( 'akn-editor-pane-heading' ).text( mw.msg( 'aknedit-gazette-documentrefs-heading' ) ),
		$documentRefs,
		$( '<h3>' ).addClass( 'akn-editor-pane-heading' ).text( mw.msg( 'aknedit-gazette-components-heading' ) ),
		$components
	);
};

AknEditorApp.prototype.runValidation = function () {
	var app = this;
	var issues = [];
	var seen = Object.create( null );
	function checkEid( id ) {
		if ( id === '' ) {
			issues.push( mw.msg( 'aknedit-validate-missing-eid' ) );
		} else if ( seen[ id ] ) {
			issues.push( mw.msg( 'aknedit-validate-dup-eid', id ) );
		}
		seen[ id ] = true;
	}
	Array.prototype.forEach.call( this.doc.querySelectorAll( '[eId]' ), function ( el ) {
		checkEid( el.getAttribute( 'eId' ) );
	} );
	var bodyElementCount = this.body ? this.listStructureElements().length : 0;
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
	if ( !this.isGazette && bodyElementCount === 0 ) {
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

AknEditorApp.prototype.serializeFullDocument = function () {
	this.commitInlineEditor( false );
	return new XMLSerializer().serializeToString( this.doc );
};

AknEditorApp.prototype.save = function ( summary ) {
	var xml = this.serializeFullDocument();
	var params = {
		action: 'edit',
		title: mw.config.get( 'wgAknEditorTitle' ),
		text: xml,
		contentmodel: 'akn-xml',
		contentformat: 'application/xml',
		summary: summary
	};
	var baseRevId = mw.config.get( 'wgAknEditorBaseRevId' );
	if ( baseRevId ) {
		params.baserevid = baseRevId;
	}
	return new mw.Api().postWithToken( 'csrf', params );
};

AknEditorApp.prototype.compareChanges = function () {
	var xml = this.serializeFullDocument();
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

AknEditorApp.prototype.openPreviewTab = function () {
	var xml = this.serializeFullDocument();
	this.renderDocument();
	var $form = $( '<form>' ).attr( {
		method: 'post',
		target: '_blank',
		action: mw.util.getUrl( mw.config.get( 'wgAknEditorTitle' ), { action: 'aknedit' } )
	} ).append(
		$( '<input>' ).attr( { type: 'hidden', name: 'wpAknPreview', value: '1' } ),
		$( '<textarea>' ).attr( 'name', 'wpAknXml' ).val( xml ).hide()
	).appendTo( document.body );
	$form.trigger( 'submit' );
	$form.remove();
};

AknEditorApp.prototype.exitEditor = function () {
	var app = this;
	if ( !this.dirty ) {
		location.href = mw.util.getUrl( mw.config.get( 'wgAknEditorTitle' ) );
		return;
	}
	OO.ui.confirm( mw.msg( 'aknedit-close-confirm' ) ).done( function ( confirmed ) {
		if ( confirmed ) {
			app.dirty = false;
			location.href = mw.util.getUrl( mw.config.get( 'wgAknEditorTitle' ) );
		}
	} );
};

AknEditorApp.prototype.buildHeader = function () {
	var app = this;

	var $title = $( '<div>' ).addClass( 'akn-editor-header-title' ).append(
		$( '<strong>' ).text( mw.config.get( 'wgAknEditorTitle' ) )
	);
	var alias = this.documentAlias();
	if ( alias ) {
		$title.append( $( '<span>' ).addClass( 'akn-editor-header-alias' ).text( alias ) );
	}

	var metadataButton = new OO.ui.ButtonWidget( { icon: 'tag', label: mw.msg( 'aknedit-tool-metadata' ) } );
	metadataButton.on( 'click', function () {
		app.windowManager.openWindow( app.metadataDialog );
	} );

	var validateButton = new OO.ui.ButtonWidget( { icon: 'check', label: mw.msg( 'aknedit-tool-validate' ) } );
	validateButton.on( 'click', function () {
		app.showValidation();
	} );

	var saveButton = new OO.ui.ButtonWidget( { label: mw.msg( 'aknedit-save' ), flags: [ 'primary', 'progressive' ] } );
	saveButton.on( 'click', function () {
		app.windowManager.openWindow( app.saveDialog );
	} );

	var closeButton = new OO.ui.ButtonWidget( { icon: 'close', label: mw.msg( 'aknedit-close' ) } );
	closeButton.on( 'click', function () {
		app.exitEditor();
	} );

	var $actions = $( '<div>' ).addClass( 'akn-editor-header-actions' ).append(
		metadataButton.$element,
		validateButton.$element,
		saveButton.$element,
		closeButton.$element
	);

	return $( '<div>' ).addClass( 'akn-editor-header' ).append( $title, $actions );
};

AknEditorApp.prototype.buildZoomControls = function () {
	var app = this;
	var zoomOut = new OO.ui.ButtonWidget( { icon: 'subtract', label: mw.msg( 'aknedit-zoom-out' ), invisibleLabel: true } );
	var zoomIn = new OO.ui.ButtonWidget( { icon: 'add', label: mw.msg( 'aknedit-zoom-in' ), invisibleLabel: true } );
	this.$zoomLabel = $( '<span>' ).addClass( 'akn-editor-zoom-label' ).text( '100%' );
	zoomOut.on( 'click', function () {
		app.setZoom( app.zoom - 0.1 );
	} );
	zoomIn.on( 'click', function () {
		app.setZoom( app.zoom + 0.1 );
	} );
	return $( '<div>' ).addClass( 'akn-editor-zoom' ).append(
		zoomOut.$element, this.$zoomLabel, zoomIn.$element
	);
};

AknEditorApp.prototype.mount = function ( $overlay ) {
	var app = this;
	var windowManager = new OO.ui.WindowManager();

	var saveDialog = new SaveDialog();
	var metadataDialog = new MetadataDialog();
	var refDialog = new RefDialog();
	var attrValueDialog = new AttrValueDialog();
	windowManager.addWindows( [ saveDialog, metadataDialog, refDialog, attrValueDialog ] );
	app.windowManager = windowManager;
	app.saveDialog = saveDialog;
	app.metadataDialog = metadataDialog;
	app.refDialog = refDialog;
	app.attrValueDialog = attrValueDialog;
	app.metaOverlay = metadataDialog.$overlay;

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
				body ? $( '<table>' ).addClass( 'diff akn-editor-diff' ).append(
					$( '<colgroup>' ).append(
						$( '<col>' ).addClass( 'diff-marker' ),
						$( '<col>' ).addClass( 'diff-content' ),
						$( '<col>' ).addClass( 'diff-marker' ),
						$( '<col>' ).addClass( 'diff-content' )
					),
					$( '<tbody>' ).html( body )
				) : $( '<p>' ).text( mw.msg( 'aknedit-showchanges-none' ) )
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

	saveDialog.on( 'review', showChangesFlow );
	saveDialog.on( 'preview', previewFlow );
	saveDialog.on( 'save', function ( summary, deferred ) {
		app.save( summary ).done( function () {
			deferred.resolve();
			app.exitEditor();
		} ).fail( function ( code, result ) {
			deferred.reject( new OO.ui.Error( mw.msg( 'aknedit-save-error', apiErrorDetail( code, result ) ), { recoverable: true } ) );
		} );
	} );

	var $main = $( '<div>' ).addClass( 'akn-editor-main' );
	this.$document = $( '<div>' ).addClass( 'akn-editor-document' );

	if ( app.isGazette ) {
		this.$document.append( app.buildGazetteWorkspace() );
		$main.append( this.$document );
	} else {
		this.$pages = $( '<div>' ).addClass( 'akn-editor-pages' );
		this.$document.append( this.$pages );
		var elementsPanel = app.buildElementsPanel();
		var $docwrap = $( '<div>' ).addClass( 'akn-editor-docwrap' ).append(
			this.$document,
			app.buildZoomControls()
		);
		$main.append( app.buildNavigationPane(), elementsPanel.$panel, elementsPanel.$expand, $docwrap );
		this.$document.on( 'click', this.onDocumentClick.bind( this ) );
	}

	$overlay.empty().append( app.buildHeader(), $main, windowManager.$element );

	if ( !app.isGazette ) {
		app.renderDocument();
	}
};
