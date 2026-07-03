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
