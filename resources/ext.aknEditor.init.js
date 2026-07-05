$( function () {
	var $root = $( '#akn-editor-root' );
	if ( $root.length === 0 ) {
		return;
	}
	var app = new AknEditorApp( mw.config.get( 'wgAknEditorXml' ) || '' );
	if ( !app.root ) {
		$root.text( mw.msg( 'aknedit-parse-error' ) );
		return;
	}
	var $overlay = $( '<div>' ).addClass( 'akn-editor-overlay' );
	$( document.body ).addClass( 'akn-editor-open' ).append( $overlay );
	app.mount( $overlay );
} );
