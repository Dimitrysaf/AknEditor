$( function () {
	var $root = $( '#akn-editor-root' );
	if ( $root.length === 0 ) {
		return;
	}
	var xml = mw.config.get( 'wgAknEditorXml' ) || '';
	if ( xml.trim() === '' ) {
		xml = aknSkeletonDocument();
	}
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
