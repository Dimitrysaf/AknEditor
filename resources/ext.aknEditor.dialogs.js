'use strict';

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
	{ action: 'review', modes: 'save', label: mw.msg( 'aknedit-save-review' ) },
	{ action: 'preview', modes: 'save', label: mw.msg( 'aknedit-save-preview' ) },
	{ action: 'back', modes: [ 'review' ], label: mw.msg( 'aknedit-save-back' ), flags: [ 'safe', 'back' ] }
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

	this.panels = new OO.ui.StackLayout( { items: [ this.savePanel, this.reviewPanel ] } );
	this.$body.append( this.panels.$element );
};

SaveDialog.prototype.swapPanel = function ( panel ) {
	this.panels.setItem( this[ panel + 'Panel' ] );
	this.actions.setMode( panel );
};

SaveDialog.prototype.setReviewContent = function ( $html ) {
	this.$reviewContent.empty().append( $html );
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

function MetaPage( name, title ) {
	MetaPage.super.call( this, name, { scrollable: true } );
	this.title = title;
}
OO.inheritClass( MetaPage, OO.ui.PageLayout );

MetaPage.prototype.setupOutlineItem = function () {
	this.outlineItem.setLabel( this.title );
};

MetaPage.prototype.setFields = function ( fields ) {
	var fieldset = new OO.ui.FieldsetLayout( { items: fields } );
	fieldset.$element.addClass( 'akn-editor-meta-grid' );
	this.$element.empty().append( fieldset.$element );
};

MetaPage.prototype.setContent = function ( $content ) {
	this.$element.empty().append( $content );
};

function MetadataDialog( config ) {
	MetadataDialog.super.call( this, config );
}
OO.inheritClass( MetadataDialog, OO.ui.ProcessDialog );
MetadataDialog.static.name = 'aknEditorMetadataDialog';
MetadataDialog.static.title = mw.msg( 'aknedit-metadata-heading' );
MetadataDialog.static.size = 'larger';
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
	return Math.max( pageHeight, Math.min( 650, window.innerHeight - 200 ) );
};

function RefDialog( config ) {
	RefDialog.super.call( this, config );
}
OO.inheritClass( RefDialog, OO.ui.ProcessDialog );
RefDialog.static.name = 'aknEditorRefDialog';
RefDialog.static.size = 'large';
RefDialog.static.actions = [
	{ label: mw.msg( 'aknedit-cancel' ), flags: 'safe' }
];

RefDialog.prototype.initialize = function () {
	RefDialog.super.prototype.initialize.call( this );
	var dialog = this;

	this.searchInput = new OO.ui.SearchInputWidget( { placeholder: mw.msg( 'aknedit-ref-search-placeholder' ) } );
	this.searchInput.on( 'change', mw.util.debounce( function ( query ) {
		dialog.loadDocuments( query );
	}, 300 ) );

	this.$tree = $( '<div>' ).addClass( 'akn-editor-reftree' );

	this.panel = new OO.ui.PanelLayout( { padded: true, expanded: false, scrollable: true } );
	this.panel.$element.append( this.searchInput.$element, this.$tree );
	this.$body.append( this.panel.$element );
};

RefDialog.prototype.makeRow = function ( depth, label, options ) {
	var dialog = this;
	options = options || {};
	var $children = $( '<div>' ).addClass( 'akn-editor-reftree-children' ).hide();
	var $chevron = $( '<span>' ).addClass( 'akn-editor-reftree-chevron' );
	var $label = $( '<span>' ).addClass( 'akn-editor-reftree-label' ).text( label );
	var $row = $( '<div>' )
		.addClass( 'akn-editor-reftree-row' )
		.toggleClass( 'akn-editor-reftree-doc', !!options.isDoc )
		.css( 'paddingInlineStart', ( depth * 1.1 ) + 'em' )
		.append( $chevron, $label );

	var expanded = false;
	function toggle() {
		if ( !options.expandable ) {
			return;
		}
		expanded = !expanded;
		$row.toggleClass( 'akn-editor-reftree-expanded', expanded );
		if ( expanded && options.onFirstExpand ) {
			var loader = options.onFirstExpand;
			options.onFirstExpand = null;
			loader( $children );
		}
		$children.toggle( expanded );
	}

	if ( options.expandable ) {
		$row.addClass( 'akn-editor-reftree-expandable' );
		$chevron.on( 'click', function ( e ) {
			e.stopPropagation();
			toggle();
		} );
	}
	$row.on( 'click', function () {
		if ( options.onSelect ) {
			options.onSelect();
		} else {
			toggle();
		}
	} );

	return { $row: $row, $children: $children, toggle: toggle };
};

RefDialog.prototype.nodeLabel = function ( num, heading, type ) {
	var base = ( num || '' ).trim();
	var extra = ( heading || '' ).trim();
	if ( !base ) {
		base = elementTypeLabel( type || '' );
	}
	return extra ? base + ' — ' + extra : base;
};

RefDialog.prototype.renderRemoteTree = function ( $container, match, rows ) {
	var dialog = this;
	var byEid = {};
	var roots = [];
	rows.forEach( function ( row ) {
		byEid[ row.eid ] = { row: row, children: [] };
	} );
	rows.forEach( function ( row ) {
		var node = byEid[ row.eid ];
		if ( row.parent && byEid[ row.parent ] ) {
			byEid[ row.parent ].children.push( node );
		} else {
			roots.push( node );
		}
	} );

	var wholeDoc = dialog.makeRow( 1, mw.msg( 'aknedit-ref-fragment-whole' ), {
		onSelect: function () {
			dialog.commit( match.workUri );
		}
	} );
	$container.append( wholeDoc.$row );

	function renderNode( node, depth, $parent ) {
		var handle = dialog.makeRow( depth, dialog.nodeLabel( node.row.num, node.row.heading, node.row.type ), {
			expandable: node.children.length > 0,
			onSelect: function () {
				dialog.commit( match.workUri + '#' + node.row.eid );
			}
		} );
		$parent.append( handle.$row, handle.$children );
		node.children.forEach( function ( child ) {
			renderNode( child, depth + 1, handle.$children );
		} );
	}
	roots.forEach( function ( node ) {
		renderNode( node, 1, $container );
	} );
};

RefDialog.prototype.renderLocalTree = function ( $container ) {
	var dialog = this;
	var app = this.app;
	var treeTypes = AKN_DISPLAY_TYPES.concat( [ 'paragraph', 'list', 'point' ] );

	function walk( parentEl, depth, $parent ) {
		Array.prototype.forEach.call( parentEl.children, function ( child ) {
			if ( treeTypes.indexOf( child.localName ) === -1 ) {
				walk( child, depth, $parent );
				return;
			}
			var eid = child.getAttribute( 'eId' );
			if ( !eid ) {
				return;
			}
			if ( child.localName === 'list' ) {
				walk( child, depth, $parent );
				return;
			}
			var hasChildren = !!child.querySelector( '[eId]' );
			var handle = dialog.makeRow( depth, dialog.nodeLabel(
				app.childText( child, 'num' ),
				app.childText( child, 'heading' ),
				child.localName
			), {
				expandable: hasChildren,
				onSelect: function () {
					dialog.commit( '#' + eid );
				}
			} );
			$parent.append( handle.$row, handle.$children );
			walk( child, depth + 1, handle.$children );
		} );
	}

	if ( app.body ) {
		walk( app.body, 1, $container );
	}
};

RefDialog.prototype.loadDocuments = function ( query ) {
	var dialog = this;
	var app = this.app;
	var requestId = ++this.requestId;
	this.$tree.empty();

	var currentLabel = app.documentAlias() || mw.config.get( 'wgAknEditorTitle' );
	var current = this.makeRow( 0, currentLabel, { isDoc: true, expandable: true, onFirstExpand: function ( $children ) {
		dialog.renderLocalTree( $children );
	} } );
	current.$row.addClass( 'akn-editor-reftree-current' );
	this.$tree.append( current.$row, current.$children );
	if ( !query ) {
		current.toggle();
	}

	new mw.Api().get( { action: 'aknreference', op: 'search', query: query || '', formatversion: 2 } ).done( function ( result ) {
		if ( requestId !== dialog.requestId ) {
			return;
		}
		var currentPageId = mw.config.get( 'wgArticleId' );
		( ( result.aknreference && result.aknreference.matches ) || [] ).forEach( function ( match ) {
			if ( match.pageid === currentPageId ) {
				return;
			}
			var row = dialog.makeRow( 0, match.alias || match.title, { isDoc: true, expandable: true, onFirstExpand: function ( $children ) {
				new mw.Api().get( { action: 'aknreference', op: 'eids', pageid: match.pageid, formatversion: 2 } ).done( function ( eidResult ) {
					dialog.renderRemoteTree( $children, match, ( eidResult.aknreference && eidResult.aknreference.eids ) || [] );
				} );
			} } );
			dialog.$tree.append( row.$row, row.$children );
		} );
	} );
};

RefDialog.prototype.commit = function ( href ) {
	var editor = this.target.editor;
	var modelKey = this.target.modelKey;
	var attrs = {};
	attrs[ this.def.attr ] = href;
	var ranges = this.capturedModelRanges;
	editor.model.change( function ( writer ) {
		ranges.forEach( function ( range ) {
			writer.setAttribute( modelKey, attrs, range );
		} );
	} );
	this.close();
};

RefDialog.prototype.getSetupProcess = function ( data ) {
	return RefDialog.super.prototype.getSetupProcess.call( this, data ).next( function () {
		this.app = data.app;
		this.target = data.target;
		this.def = data.def;
		this.capturedModelRanges = data.capturedModelRanges;
		this.requestId = this.requestId || 0;
		this.title.setLabel( mw.msg( data.def.msgKey ) );
		this.searchInput.setValue( '' );
		this.loadDocuments( '' );
	}, this );
};

RefDialog.prototype.getBodyHeight = function () {
	return Math.min( 650, window.innerHeight - 200 );
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
