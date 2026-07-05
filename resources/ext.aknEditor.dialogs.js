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
		this.target = data.target;
		this.def = data.def;
		this.capturedModelRanges = data.capturedModelRanges;
		this.chosenMatch = null;
		this.title.setLabel( mw.msg( data.def.msgKey ) );

		this.searchInput.setValue( '' );
		this.docMenu.clearItems();
		this.showSearch();

		this.localMenu.clearItems();
		var localMenu = this.localMenu;
		data.app.listStructureElements().forEach( function ( entry ) {
			localMenu.addItems( [ new OO.ui.MenuOptionWidget( { data: entry.eId, label: entry.label + ' (' + entry.eId + ')' } ) ] );
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

function PropertiesDialog( config ) {
	PropertiesDialog.super.call( this, config );
}
OO.inheritClass( PropertiesDialog, OO.ui.ProcessDialog );
PropertiesDialog.static.name = 'aknEditorPropertiesDialog';
PropertiesDialog.static.size = 'medium';
PropertiesDialog.static.actions = [
	{ label: mw.msg( 'aknedit-cancel' ), flags: 'safe' }
];

PropertiesDialog.prototype.initialize = function () {
	PropertiesDialog.super.prototype.initialize.call( this );
	this.$content = $( '<div>' );
	this.$body.append( this.$content );
};

PropertiesDialog.prototype.getSetupProcess = function ( data ) {
	return PropertiesDialog.super.prototype.getSetupProcess.call( this, data ).next( function () {
		this.title.setLabel( elementTypeLabel( data.localName ) );
		this.$content.empty().append(
			$( '<h4>' ).addClass( 'akn-editor-dialog-heading' ).text( mw.msg( 'aknedit-attr-heading' ) ),
			data.app.renderAttributeTable( data.attrAdapter )
		);
	}, this );
};

PropertiesDialog.prototype.getBodyHeight = function () {
	return Math.max( this.$content.outerHeight( true ) || 0, 200 );
};
