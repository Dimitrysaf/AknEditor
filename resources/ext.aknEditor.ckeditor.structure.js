'use strict';

function aknCollectExtraAttrs( viewElement ) {
	var attrs = {};
	Array.from( viewElement.getAttributeKeys() ).forEach( function ( key ) {
		if ( key === 'eId' || key === 'xmlns' ) {
			return;
		}
		attrs[ key ] = viewElement.getAttribute( key );
	} );
	return attrs;
}

function buildAknArticlePlugin( app ) {
	class AknArticlePlugin extends CKE.Plugin {
		static get requires() {
			return [
				CKE.Widget, CKE.Essentials, CKE.Paragraph, CKE.List, CKE.Indent,
				AknInlineSpans, AknNoteBlock, app.aknInlineToolbarPlugin, app.aknRefPickerPlugin,
				app.aknTablePlugin, app.aknBlockListPlugin, app.aknQuotedStructurePlugin,
				AknRawFallback
			];
		}

		init() {
			var editor = this.editor;
			var schema = editor.model.schema;
			var conversion = editor.conversion;

			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'paragraph',
				view: function ( modelElement, api ) {
					return api.writer.createContainerElement( 'p', { class: 'akn-p' } );
				},
				converterPriority: 'high'
			} );

			schema.register( 'akn_article', {
				allowIn: '$root',
				isLimit: true,
				allowAttributes: [ 'eId', 'aknAttrs' ]
			} );
			schema.register( 'akn_article_num', { allowIn: 'akn_article', isLimit: true, allowChildren: '$text' } );
			schema.register( 'akn_article_heading', { allowIn: 'akn_article', isLimit: true, allowChildren: '$text' } );
			schema.register( 'akn_article_body', { allowIn: 'akn_article', isLimit: true, allowContentOf: '$root' } );
			schema.extend( '$text', { allowIn: [ 'akn_article_num', 'akn_article_heading' ] } );

			conversion.for( 'upcast' ).add( function ( dispatcher ) {
				dispatcher.on( 'element:article', function ( evt, data, api ) {
					if ( !api.consumable.consume( data.viewItem, { name: true } ) ) {
						return;
					}
					var writer = api.writer;
					var articleModel = writer.createElement( 'akn_article', {
						eId: data.viewItem.getAttribute( 'eId' ) || app.nextEid( 'article' ),
						aknAttrs: aknCollectExtraAttrs( data.viewItem )
					} );
					if ( !api.safeInsert( articleModel, data.modelCursor ) ) {
						return;
					}
					var numModel = writer.createElement( 'akn_article_num' );
					var headingModel = writer.createElement( 'akn_article_heading' );
					var bodyModel = writer.createElement( 'akn_article_body' );
					writer.append( numModel, articleModel );
					writer.append( headingModel, articleModel );
					writer.append( bodyModel, articleModel );

					Array.from( data.viewItem.getChildren() ).forEach( function ( child ) {
						if ( child.is && child.is( 'element', 'num' ) ) {
							api.consumable.consume( child, { name: true } );
							api.convertChildren( child, writer.createPositionAt( numModel, 'end' ) );
						} else if ( child.is && child.is( 'element', 'heading' ) ) {
							api.consumable.consume( child, { name: true } );
							api.convertChildren( child, writer.createPositionAt( headingModel, 'end' ) );
						} else {
							api.convertItem( child, writer.createPositionAt( bodyModel, 'end' ) );
						}
					} );

					data.modelCursor = writer.createPositionAfter( articleModel );
					data.modelRange = writer.createRangeOn( articleModel );
				} );
			} );

			conversion.for( 'dataDowncast' ).elementToElement( {
				model: 'akn_article',
				view: function ( modelElement, api ) {
					var attrs = Object.assign( {}, modelElement.getAttribute( 'aknAttrs' ) || {} );
					var eId = modelElement.getAttribute( 'eId' );
					if ( eId ) {
						attrs.eId = eId;
					}
					return api.writer.createContainerElement( 'article', attrs );
				}
			} );
			conversion.for( 'dataDowncast' ).elementToElement( { model: 'akn_article_num', view: 'num' } );
			conversion.for( 'dataDowncast' ).elementToElement( { model: 'akn_article_heading', view: 'heading' } );
			conversion.for( 'dataDowncast' ).elementToElement( { model: 'akn_article_body', view: 'akn-item-body-passthrough' } );

			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'akn_article',
				view: function ( modelElement, api ) {
					var el = api.writer.createContainerElement( 'section', {
						class: 'akn-article akn-block',
						'data-akn-eid': modelElement.getAttribute( 'eId' ) || ''
					} );
					return CKE.toWidget( el, api.writer, { label: elementTypeLabel( 'article' ) } );
				}
			} );
			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'akn_article_num',
				view: function ( modelElement, api ) {
					return CKE.toWidgetEditable(
						api.writer.createEditableElement( 'h6', { class: 'akn-designation' } ),
						api.writer
					);
				}
			} );
			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'akn_article_heading',
				view: function ( modelElement, api ) {
					return CKE.toWidgetEditable(
						api.writer.createEditableElement( 'div', { class: 'akn-rubric' } ),
						api.writer
					);
				}
			} );
			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'akn_article_body',
				view: function ( modelElement, api ) {
					return CKE.toWidgetEditable(
						api.writer.createEditableElement( 'div', { class: 'akn-editor-article-body' } ),
						api.writer
					);
				}
			} );
		}
	}

	return AknArticlePlugin;
}

class AknNoteBlock extends CKE.Plugin {
	static get requires() {
		return [ CKE.Widget ];
	}

	init() {
		var editor = this.editor;
		var schema = editor.model.schema;
		var conversion = editor.conversion;

		schema.register( 'aknNoteBlock', {
			inheritAllFrom: '$blockObject',
			allowAttributes: [ 'aknAttrs' ]
		} );
		schema.register( 'aknNoteBlockBody', { allowIn: 'aknNoteBlock', isLimit: true, allowContentOf: '$root' } );
		schema.extend( '$block', { allowIn: 'aknNoteBlockBody' } );

		conversion.for( 'upcast' ).add( function ( dispatcher ) {
			dispatcher.on( 'element:note', function ( evt, data, api ) {
				var hasElementChild = Array.from( data.viewItem.getChildren() ).some( function ( child ) {
					return child.is && child.is( 'element' );
				} );
				if ( !hasElementChild ) {
					return;
				}
				if ( !api.consumable.consume( data.viewItem, { name: true } ) ) {
					return;
				}
				var writer = api.writer;
				var noteModel = writer.createElement( 'aknNoteBlock', {
					aknAttrs: aknCollectExtraAttrs( data.viewItem )
				} );
				if ( !api.safeInsert( noteModel, data.modelCursor ) ) {
					return;
				}
				var bodyModel = writer.createElement( 'aknNoteBlockBody' );
				writer.append( bodyModel, noteModel );
				api.convertChildren( data.viewItem, writer.createPositionAt( bodyModel, 0 ) );
				data.modelCursor = writer.createPositionAfter( noteModel );
				data.modelRange = writer.createRangeOn( noteModel );
			}, { priority: 'high' } );
		} );

		conversion.for( 'dataDowncast' ).elementToElement( {
			model: 'aknNoteBlock',
			view: function ( modelElement, api ) {
				return api.writer.createContainerElement( 'note', Object.assign( {}, modelElement.getAttribute( 'aknAttrs' ) || {} ) );
			}
		} );
		conversion.for( 'dataDowncast' ).elementToElement( { model: 'aknNoteBlockBody', view: 'akn-item-body-passthrough' } );

		conversion.for( 'editingDowncast' ).elementToElement( {
			model: 'aknNoteBlock',
			view: function ( modelElement, api ) {
				return CKE.toWidget(
					api.writer.createContainerElement( 'div', { class: 'akn-note-declaration' } ),
					api.writer,
					{ label: mw.msg( 'aknedit-inline-note' ) }
				);
			}
		} );
		conversion.for( 'editingDowncast' ).elementToElement( {
			model: 'aknNoteBlockBody',
			view: function ( modelElement, api ) {
				return CKE.toWidgetEditable(
					api.writer.createEditableElement( 'div', { class: 'akn-editor-note-body' } ),
					api.writer
				);
			}
		} );
	}
}

function createAknElementEditor( app, container, elementXml ) {
	var deferred = $.Deferred();
	var AknArticlePlugin = buildAknArticlePlugin( app );

	CKE.ClassicEditor.create( container, {
		licenseKey: 'GPL',
		plugins: [ AknArticlePlugin ],
		toolbar: {
			items: [ 'undo', 'redo', '|', 'numberedList', 'outdent', 'indent', '|' ]
				.concat( aknInlineToolbarItemNames() )
				.concat( [ 'akn-ref', 'akn-rref', '|',
					'insertTable', 'tableColumn', 'tableRow', 'mergeTableCells', '|',
					'aknInsertQuotedStructure' ] ),
			shouldNotGroupWhenFull: false
		},
		table: { contentToolbar: [ 'tableColumn', 'tableRow', 'mergeTableCells', 'toggleTableCaption' ] }
	} ).then( function ( editor ) {
		editor.data.processor = new AknDataProcessor( editor.editing.view.document );

		editor.editing.view.change( function ( writer ) {
			writer.addClass( 'akn-document', editor.editing.view.document.getRoot() );
		} );

		editor.setData( '<body xmlns="' + AKN_NS + '">' + elementXml + '</body>' );

		deferred.resolve( { editor: editor } );
	} ).catch( function ( error ) {
		deferred.reject( error );
	} );

	return deferred.promise();
}
