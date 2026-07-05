'use strict';

function apiErrorDetail( code, result ) {
	return result && result.error ? result.error.info : code;
}

function openAttrValueDialog( app, def, onDone ) {
	app.windowManager.openWindow( app.attrValueDialog, {
		msgKey: def.msgKey,
		inputType: def.inputType,
		onDone: onDone
	} );
}

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

	this.$label = $( '<span>' ).addClass( 'akn-editor-outline-row-label' ).text( label );

	this.$element
		.addClass( 'akn-editor-outline-row' )
		.data( 'aknOutlineRow', this )
		.css( 'paddingInlineStart', ( level * 0.9 ) + 'em' )
		.append( this.collapseButton.$element, this.$label )
		.on( 'click', this.onClick.bind( this ) );
}
OO.inheritClass( OutlineRow, OO.ui.Widget );

OutlineRow.prototype.onClick = function () {
	this.emit( 'select' );
};

OutlineRow.prototype.setLabel = function ( label ) {
	this.$label.text( label );
};

OutlineRow.prototype.setActive = function ( active ) {
	this.$element.toggleClass( 'akn-editor-outline-row-active', active );
};

function OutlineGroup( config ) {
	OutlineGroup.super.call( this, config );
	config = Object.assign( { $group: this.$element }, config );
	OO.ui.mixin.GroupWidget.call( this, config );
	this.$element.addClass( 'akn-editor-outline-group' );
}
OO.inheritClass( OutlineGroup, OO.ui.Widget );
OO.mixinClass( OutlineGroup, OO.ui.mixin.GroupWidget );
