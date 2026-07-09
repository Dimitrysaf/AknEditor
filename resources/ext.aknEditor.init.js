$( function () {
	var $root = $( '#akn-editor-root' );
	if ( $root.length === 0 ) {
		return;
	}
	// The document to edit is always provided by the server: an existing
	// page's stored XML, a fresh schema-valid skeleton for a blank page
	// (AknEditAction), or the wizard's seed (Special:NewAkn). The editor no
	// longer synthesises a skeleton client-side — that guaranteed neither
	// schema validity nor the correct namespace.
	var xml = mw.config.get( 'wgAknEditorXml' ) || '';
	var app = new AknEditorApp( xml );
	if ( !app.root ) {
		$root.text( mw.msg( 'aknedit-parse-error' ) );
		return;
	}
	var $overlay = $( '<div>' ).addClass( 'akn-editor-overlay' );
	$( document.body ).addClass( 'akn-editor-open' ).append( $overlay );
	app.mount( $overlay );
	window.aknEditorApp = app;
} );
