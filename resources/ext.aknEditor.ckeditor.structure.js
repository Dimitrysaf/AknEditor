'use strict';

function aknStructModelName( type ) {
	return 'akn_' + type;
}

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

function AknModelAttrAdapter( editor, modelElement, localName ) {
	this.editor = editor;
	this.modelElement = modelElement;
	this.localName = localName;
}

Object.defineProperty( AknModelAttrAdapter.prototype, 'attributes', {
	get: function () {
		var bag = this.modelElement.getAttribute( 'aknAttrs' ) || {};
		return Object.keys( bag ).map( function ( name ) {
			return { name: name, value: bag[ name ] };
		} );
	}
} );

AknModelAttrAdapter.prototype.getAttribute = function ( name ) {
	var bag = this.modelElement.getAttribute( 'aknAttrs' ) || {};
	return bag[ name ] || null;
};

AknModelAttrAdapter.prototype._writeBag = function ( mutate ) {
	var modelElement = this.modelElement;
	var bag = Object.assign( {}, modelElement.getAttribute( 'aknAttrs' ) || {} );
	mutate( bag );
	this.editor.model.change( function ( writer ) {
		writer.setAttribute( 'aknAttrs', bag, modelElement );
	} );
};

AknModelAttrAdapter.prototype.setAttribute = function ( name, value ) {
	this._writeBag( function ( bag ) {
		bag[ name ] = value;
	} );
};

AknModelAttrAdapter.prototype.removeAttribute = function ( name ) {
	this._writeBag( function ( bag ) {
		delete bag[ name ];
	} );
};

function buildAknStructurePlugin( app ) {
	var structureTypes = ( app.vocab.structureTypes || [] ).concat( [ 'hcontainer' ] );
	var containerModelNames = structureTypes
		.filter( function ( type ) { return !formConfigFor( type ).content; } )
		.map( aknStructModelName );

	class AknStructurePlugin extends CKE.Plugin {
		static get requires() {
			return [
				CKE.Widget, CKE.Essentials, CKE.Paragraph,
				AknInlineSpans, app.aknInlineToolbarPlugin, app.aknRefPickerPlugin,
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

			structureTypes.forEach( function ( type ) {
				var modelName = aknStructModelName( type );
				var isLeaf = formConfigFor( type ).content;
				var isTitled = TITLED_TYPES.indexOf( type ) !== -1;

				schema.register( modelName, {
					allowIn: [ '$root' ].concat( containerModelNames ),
					isLimit: true,
					allowAttributes: [ 'eId', 'aknAttrs' ]
				} );
				schema.register( modelName + '_num', { allowIn: modelName, isLimit: true, allowChildren: '$text' } );
				schema.register( modelName + '_heading', { allowIn: modelName, isLimit: true, allowChildren: '$text' } );
				schema.extend( '$text', { allowIn: [ modelName + '_num', modelName + '_heading' ] } );

				conversion.for( 'upcast' ).elementToElement( {
					view: type,
					model: function ( viewElement, api ) {
						return api.writer.createElement( modelName, {
							eId: viewElement.getAttribute( 'eId' ) || app.nextEid( type ),
							aknAttrs: aknCollectExtraAttrs( viewElement )
						} );
					}
				} );
				[ 'num', 'heading' ].forEach( function ( tag ) {
					conversion.for( 'upcast' ).elementToElement( {
						view: function ( el ) {
							var matches = el.is && el.is( 'element', tag ) && el.parent && el.parent.is( 'element', type );
							return matches ? { name: true } : null;
						},
						model: modelName + '_' + tag
					} );
				} );

				conversion.for( 'dataDowncast' ).elementToElement( {
					model: modelName,
					view: function ( modelElement, api ) {
						var attrs = Object.assign( {}, modelElement.getAttribute( 'aknAttrs' ) || {} );
						var eId = modelElement.getAttribute( 'eId' );
						if ( eId ) {
							attrs.eId = eId;
						}
						return api.writer.createContainerElement( type, attrs );
					}
				} );
				conversion.for( 'dataDowncast' ).elementToElement( { model: modelName + '_num', view: 'num' } );
				conversion.for( 'dataDowncast' ).elementToElement( { model: modelName + '_heading', view: 'heading' } );

				conversion.for( 'editingDowncast' ).elementToElement( {
					model: modelName,
					view: function ( modelElement, api ) {
						var el = api.writer.createContainerElement( 'section', {
							class: 'akn-' + type + ( isTitled ? ' akn-block' : ' akn-prov' ),
							'data-akn-eid': modelElement.getAttribute( 'eId' ) || ''
						} );
						return CKE.toWidget( el, api.writer, { label: elementTypeLabel( type ) } );
					}
				} );
				conversion.for( 'editingDowncast' ).elementToElement( {
					model: modelName + '_num',
					view: function ( modelElement, api ) {
						var viewEl = isTitled ?
							api.writer.createEditableElement( 'h' + Math.min( headingLevel( type ), 6 ), { class: 'akn-designation' } ) :
							api.writer.createEditableElement( 'span', { class: 'akn-num' } );
						return CKE.toWidgetEditable( viewEl, api.writer );
					}
				} );
				conversion.for( 'editingDowncast' ).elementToElement( {
					model: modelName + '_heading',
					view: function ( modelElement, api ) {
						return CKE.toWidgetEditable(
							api.writer.createEditableElement( 'div', { class: 'akn-rubric' } ),
							api.writer
						);
					}
				} );

				if ( isLeaf ) {
					var bodyModelName = modelName + '_body';
					schema.register( bodyModelName, { allowIn: modelName, isLimit: true, allowContentOf: '$root' } );
					conversion.for( 'upcast' ).elementToElement( {
						view: function ( el ) {
							var matches = el.is && el.is( 'element', 'content' ) && el.parent && el.parent.is( 'element', type );
							return matches ? { name: true } : null;
						},
						model: bodyModelName
					} );
					conversion.for( 'dataDowncast' ).elementToElement( { model: bodyModelName, view: 'content' } );
					conversion.for( 'editingDowncast' ).elementToElement( {
						model: bodyModelName,
						view: function ( modelElement, api ) {
							return CKE.toWidgetEditable(
								api.writer.createEditableElement( 'div', { class: 'akn-editor-struct-body' } ),
								api.writer
							);
						}
					} );
				}
			} );
		}
	}

	return AknStructurePlugin;
}

function aknNearestStructuralAncestor( editor, position ) {
	position = position || editor.model.document.selection.getFirstPosition();
	if ( !position ) {
		return null;
	}
	var node = position.parent;
	while ( node ) {
		if ( node.is && node.is( 'element' ) && /^akn_[a-zA-Z]+$/.test( node.name ) &&
			!/_(num|heading|body)$/.test( node.name ) ) {
			return node;
		}
		node = node.parent;
	}
	return null;
}

class AknInsertStructureCommand extends CKE.Command {
	constructor( editor, type, app ) {
		super( editor );
		this.type = type;
		this.app = app;
	}

	refresh() {
		this.isEnabled = true;
	}

	execute() {
		var editor = this.editor;
		var type = this.type;
		var app = this.app;
		var modelName = aknStructModelName( type );
		var isLeaf = formConfigFor( type ).content;

		editor.model.change( function ( writer ) {
			var anchor = aknNearestStructuralAncestor( editor );
			var el = writer.createElement( modelName, { eId: app.nextEid( type ), aknAttrs: {} } );
			var heading = writer.createElement( modelName + '_heading' );
			writer.append( heading, el );
			if ( isLeaf ) {
				var body = writer.createElement( modelName + '_body' );
				writer.append( writer.createElement( 'paragraph' ), body );
				writer.append( body, el );
			}

			if ( anchor ) {
				writer.insert( el, writer.createPositionAfter( anchor ) );
			} else {
				writer.append( el, editor.model.document.getRoot() );
			}
			writer.setSelection( writer.createPositionAt( heading, 0 ) );
		} );
		editor.editing.view.focus();
	}
}

class AknMoveStructureCommand extends CKE.Command {
	constructor( editor, direction ) {
		super( editor );
		this.direction = direction;
	}

	refresh() {
		var el = aknNearestStructuralAncestor( this.editor );
		this.isEnabled = !!el && !!( this.direction < 0 ? el.previousSibling : el.nextSibling );
	}

	execute() {
		var editor = this.editor;
		var direction = this.direction;
		editor.model.change( function ( writer ) {
			var el = aknNearestStructuralAncestor( editor );
			if ( !el ) {
				return;
			}
			var sibling = direction < 0 ? el.previousSibling : el.nextSibling;
			if ( !sibling ) {
				return;
			}
			var targetPosition = direction < 0 ?
				writer.createPositionBefore( sibling ) :
				writer.createPositionAfter( sibling );
			writer.move( writer.createRangeOn( el ), targetPosition );
		} );
		editor.editing.view.focus();
	}
}

class AknRemoveStructureCommand extends CKE.Command {
	refresh() {
		this.isEnabled = !!aknNearestStructuralAncestor( this.editor );
	}

	execute() {
		var editor = this.editor;
		var el = aknNearestStructuralAncestor( editor );
		if ( !el ) {
			return;
		}
		OO.ui.confirm( mw.msg( 'aknedit-remove-confirm' ) ).done( function ( confirmed ) {
			if ( !confirmed ) {
				return;
			}
			editor.model.change( function ( writer ) {
				writer.remove( el );
			} );
		} );
	}
}

class AknPropertiesCommand extends CKE.Command {
	constructor( editor, app ) {
		super( editor );
		this.app = app;
	}

	refresh() {
		this.isEnabled = !!aknNearestStructuralAncestor( this.editor );
	}

	execute() {
		var el = aknNearestStructuralAncestor( this.editor );
		if ( !el ) {
			return;
		}
		var localName = el.name.replace( /^akn_/, '' );
		this.app.openPropertiesPopover( new AknModelAttrAdapter( this.editor, el, localName ), localName );
	}
}

function buildAknStructureCommandsPlugin( app ) {
	var structureTypes = ( app.vocab.structureTypes || [] ).concat( [ 'hcontainer' ] );

	class AknStructureCommands extends CKE.Plugin {
		init() {
			var editor = this.editor;

			structureTypes.forEach( function ( type ) {
				var commandName = 'aknInsert_' + type;
				editor.commands.add( commandName, new AknInsertStructureCommand( editor, type, app ) );
				editor.ui.componentFactory.add( commandName, function ( locale ) {
					var command = editor.commands.get( commandName );
					var button = new CKE.ButtonView( locale );
					button.set( { label: elementTypeLabel( type ), tooltip: true, withText: true } );
					button.bind( 'isEnabled' ).to( command, 'isEnabled' );
					button.on( 'execute', function () { editor.execute( commandName ); } );
					return button;
				} );
			} );

			editor.commands.add( 'aknMoveUp', new AknMoveStructureCommand( editor, -1 ) );
			editor.commands.add( 'aknMoveDown', new AknMoveStructureCommand( editor, 1 ) );
			editor.commands.add( 'aknRemoveStructure', new AknRemoveStructureCommand( editor ) );
			editor.commands.add( 'aknProperties', new AknPropertiesCommand( editor, app ) );

			[
				{ name: 'aknMoveUp', msgKey: 'aknedit-tool-moveup', icon: CKE.IconArrowUp },
				{ name: 'aknMoveDown', msgKey: 'aknedit-tool-movedown', icon: CKE.IconArrowDown },
				{ name: 'aknRemoveStructure', msgKey: 'aknedit-tool-remove', icon: CKE.IconRemove },
				{ name: 'aknProperties', msgKey: 'aknedit-tool-metadata', icon: CKE.IconCog }
			].forEach( function ( def ) {
				editor.ui.componentFactory.add( def.name, function ( locale ) {
					var command = editor.commands.get( def.name );
					var button = new CKE.ButtonView( locale );
					button.set( { label: mw.msg( def.msgKey ), icon: def.icon, tooltip: true } );
					button.bind( 'isEnabled' ).to( command, 'isEnabled' );
					button.on( 'execute', function () { editor.execute( def.name ); } );
					return button;
				} );
			} );
		}
	}

	return AknStructureCommands;
}

function createAknElementEditor( app, container, elementXml ) {
	var deferred = $.Deferred();
	var AknStructurePlugin = buildAknStructurePlugin( app );
	var AknStructureCommands = buildAknStructureCommandsPlugin( app );

	CKE.ClassicEditor.create( container, {
		licenseKey: 'GPL',
		plugins: [ AknStructurePlugin, AknStructureCommands ],
		toolbar: {
			items: [ 'undo', 'redo', '|' ]
				.concat( aknInlineToolbarItemNames() )
				.concat( [ 'akn-ref', 'akn-rref', '|',
					'insertTable', 'tableColumn', 'tableRow', 'mergeTableCells', '|',
					'aknInsertBlockList', 'aknInsertQuotedStructure', '|',
					'aknMoveUp', 'aknMoveDown', 'aknRemoveStructure', 'aknProperties', '|' ] )
				.concat( aknStructureInsertItemNames( app ) ),
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

function aknStructureInsertItemNames( app ) {
	return ( app.vocab.structureTypes || [] ).concat( [ 'hcontainer' ] ).map( function ( type ) {
		return 'aknInsert_' + type;
	} );
}
