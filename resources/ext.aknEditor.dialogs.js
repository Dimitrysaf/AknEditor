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
