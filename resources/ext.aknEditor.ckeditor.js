'use strict';

var CKE = window.CKEDITOR;

var AKN_BUTTON_ICONS = {
	b: CKE.IconBold,
	i: CKE.IconItalic,
	u: CKE.IconUnderline,
	sup: CKE.IconSuperscript,
	sub: CKE.IconSubscript,
	ins: CKE.IconPlus,
	del: CKE.IconStrikethrough,
	mod: CKE.IconPencil,
	ref: CKE.IconLink,
	rref: CKE.IconBookmark,
	mref: CKE.IconLink,
	authorialnote: CKE.IconFootnote,
	note: CKE.IconInfo
};

var AKN_FORMAT_NAMES = [ 'b', 'i', 'u', 'sup', 'sub' ];

function aknSemanticNames() {
	var order = [ 'term', 'def', 'entity', 'organization', 'person', 'role', 'location',
		'concept', 'object', 'quantity', 'quotedtext', 'date', 'mref', 'authorialnote',
		'note', 'ins', 'del', 'mod' ];
	var registered = INLINE_TAGS_PRIMARY.concat( INLINE_TAGS_MORE )
		.filter( function ( entry ) { return !entry.picker && AKN_FORMAT_NAMES.indexOf( entry.name ) === -1; } )
		.map( function ( entry ) { return entry.name; } );
	return order.filter( function ( name ) {
		return registered.indexOf( name ) !== -1;
	} ).concat( registered.filter( function ( name ) {
		return order.indexOf( name ) === -1;
	} ) );
}

function aknConfigureButton( button, entry ) {
	var icon = AKN_BUTTON_ICONS[ entry.name ];
	if ( AKN_FORMAT_NAMES.indexOf( entry.name ) !== -1 && icon ) {
		button.set( { label: mw.msg( entry.msgKey ), icon: icon, tooltip: true } );
		return;
	}
	var config = { label: mw.msg( entry.msgKey ), withText: true, tooltip: true };
	if ( icon ) {
		config.icon = icon;
	}
	button.set( config );
}

function aknEscapeText( text ) {
	return text.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
}

function aknEscapeAttr( value ) {
	return aknEscapeText( String( value ) ).replace( /"/g, '&quot;' );
}

var AKN_INLINE_EDITING_VIEW = {
	b: { tag: 'b' },
	i: { tag: 'i' },
	u: { tag: 'u' },
	sup: { tag: 'sup' },
	sub: { tag: 'sub' },
	ins: { tag: 'ins', classes: 'akn-ins' },
	del: { tag: 'del', classes: 'akn-del' },
	date: { tag: 'time', classes: 'akn-date' },
	ref: { tag: 'a', classes: 'akn-ref' },
	rref: { tag: 'a', classes: 'akn-ref' },
	mref: { tag: 'span', classes: 'akn-mref' },
	mod: { tag: 'span', classes: 'akn-mod' },
	authorialnote: { tag: 'sup', classes: 'akn-noteref' },
	note: { tag: 'span', classes: 'akn-note-declaration' }
};

function aknInlineEditingElement( entry, attrsValue, writer ) {
	var spec = AKN_INLINE_EDITING_VIEW[ entry.name ] || { tag: 'span', classes: 'akn-' + entry.tag };
	var viewAttrs = {};
	if ( spec.classes ) {
		viewAttrs.class = spec.classes;
	}
	attrsValue = attrsValue || {};
	if ( entry.name === 'date' && attrsValue.date ) {
		viewAttrs.datetime = attrsValue.date;
	}
	if ( ( entry.name === 'ref' || entry.name === 'rref' ) && attrsValue.href ) {
		viewAttrs.title = attrsValue.href;
	}
	return writer.createAttributeElement( spec.tag, viewAttrs );
}

function AknDataProcessor( viewDocument ) {
	this.domParser = new DOMParser();
	this.upcastWriter = new CKE.UpcastWriter( viewDocument );
}

AknDataProcessor.prototype.toView = function ( data ) {
	var parsed = this.domParser.parseFromString( data, 'application/xml' );
	if ( parsed.getElementsByTagName( 'parsererror' ).length ) {
		return this.upcastWriter.createDocumentFragment();
	}
	return this._convertNode( parsed.documentElement, true );
};

AknDataProcessor.prototype._convertNode = function ( domNode, isRoot ) {
	var uw = this.upcastWriter;
	var self = this;

	if ( domNode.nodeType === Node.TEXT_NODE ) {
		return uw.createText( domNode.textContent.replace( /\s+/g, ' ' ) );
	}
	if ( domNode.nodeType !== Node.ELEMENT_NODE ) {
		return null;
	}

	var children = Array.prototype.map.call( domNode.childNodes, function ( child ) {
		return self._convertNode( child, false );
	} ).filter( function ( n ) { return n !== null; } );

	if ( isRoot ) {
		return uw.createDocumentFragment( children );
	}

	var attrs = {};
	Array.prototype.forEach.call( domNode.attributes || [], function ( attr ) {
		if ( attr.name === 'xmlns' ) {
			return;
		}
		attrs[ attr.name ] = attr.value;
	} );
	return uw.createElement( domNode.localName, attrs, children );
};

AknDataProcessor.prototype.toData = function ( viewFragment ) {
	return Array.from( viewFragment.getChildren() ).map( aknSerializeViewNode ).join( '' );
};

function aknSerializeViewNode( viewNode ) {
	if ( viewNode.is( '$text' ) || viewNode.is( 'text' ) ) {
		return aknEscapeText( viewNode.data );
	}
	if ( !viewNode.is( 'element' ) ) {
		return '';
	}
	if ( viewNode.hasAttribute( 'data-akn-raw' ) ) {
		return viewNode.getAttribute( 'data-akn-raw' );
	}
	var name = viewNode.name;
	if ( name === 'akn-item-body-passthrough' ) {
		return Array.from( viewNode.getChildren() ).map( aknSerializeViewNode ).join( '' );
	}
	var attrKeys = Array.from( viewNode.getAttributeKeys() );
	var attrs = attrKeys.map( function ( key ) {
		return ' ' + key + '="' + aknEscapeAttr( viewNode.getAttribute( key ) ) + '"';
	} ).join( '' );
	var inner = Array.from( viewNode.getChildren() ).map( aknSerializeViewNode ).join( '' );
	return '<' + name + attrs + '>' + inner + '</' + name + '>';
}

function aknConsumeSubtree( viewItem, consumable ) {
	Array.from( viewItem.getChildren() ).forEach( function ( child ) {
		if ( child.is && child.is( 'element' ) ) {
			consumable.consume( child, { name: true } );
			Array.from( child.getAttributeKeys() ).forEach( function ( key ) {
				consumable.consume( child, { attributes: key } );
			} );
			aknConsumeSubtree( child, consumable );
		} else if ( child.is && ( child.is( '$text' ) || child.is( 'text' ) ) ) {
			consumable.consume( child );
		}
	} );
}

class AknRawFallback extends CKE.Plugin {
	static get requires() {
		return [ CKE.Widget ];
	}

	init() {
		var editor = this.editor;
		var schema = editor.model.schema;
		var conversion = editor.conversion;

		schema.register( 'aknRawBlock', {
			inheritAllFrom: '$blockObject',
			allowAttributes: [ 'aknRawXml', 'aknRawLabel' ]
		} );
		schema.register( 'aknRawInline', {
			isInline: true,
			isObject: true,
			allowWhere: '$text',
			allowAttributes: [ 'aknRawXml', 'aknRawLabel' ]
		} );

		conversion.for( 'upcast' ).add( function ( dispatcher ) {
			dispatcher.on( 'element', function ( evt, data, api ) {
				if ( [ 'ol', 'ul', 'li', 'br' ].indexOf( data.viewItem.name ) !== -1 ) {
					return;
				}
				if ( !api.consumable.test( data.viewItem, { name: true } ) ) {
					return;
				}
				var raw = aknSerializeViewNode( data.viewItem );
				if ( !api.consumable.consume( data.viewItem, { name: true } ) ) {
					return;
				}
				aknConsumeSubtree( data.viewItem, api.consumable );

				var isBlockAllowed = editor.model.schema.checkChild( data.modelCursor, 'aknRawBlock' );
				var modelName = isBlockAllowed ? 'aknRawBlock' : 'aknRawInline';
				var modelElement = api.writer.createElement( modelName, {
					aknRawXml: raw,
					aknRawLabel: data.viewItem.name
				} );
				if ( !api.safeInsert( modelElement, data.modelCursor ) ) {
					return;
				}
				api.updateConversionResult( modelElement, data );
			}, { priority: 'low' } );
		} );

		[ 'aknRawBlock', 'aknRawInline' ].forEach( function ( modelName ) {
			conversion.for( 'dataDowncast' ).elementToElement( {
				model: modelName,
				view: function ( modelElement, api ) {
					return api.writer.createContainerElement( 'akn-raw-passthrough', {
						'data-akn-raw': modelElement.getAttribute( 'aknRawXml' )
					} );
				}
			} );
			conversion.for( 'editingDowncast' ).elementToElement( {
				model: modelName,
				view: function ( modelElement, api ) {
					var tag = modelName === 'aknRawInline' ? 'span' : 'div';
					var box = api.writer.createContainerElement( tag, { class: 'akn-editor-raw' } );
					api.writer.insert( api.writer.createPositionAt( box, 0 ), api.writer.createText(
						mw.msg( 'aknedit-raw-placeholder', modelElement.getAttribute( 'aknRawLabel' ) )
					) );
					return CKE.toWidget( box, api.writer, { label: modelElement.getAttribute( 'aknRawLabel' ) } );
				}
			} );
		} );
	}
}

class AknInlineSpans extends CKE.Plugin {
	init() {
		var editor = this.editor;
		var schema = editor.model.schema;
		var conversion = editor.conversion;

		INLINE_TAGS_PRIMARY.concat( INLINE_TAGS_MORE ).forEach( function ( entry ) {
			var modelKey = 'akn_' + entry.name;

			schema.extend( '$text', { allowAttributes: modelKey } );

			var viewMatcher = entry.tag;
			if ( entry.name === 'note' ) {
				viewMatcher = function ( el ) {
					if ( !( el.is && el.is( 'element', 'note' ) ) ) {
						return null;
					}
					var hasElementChild = Array.from( el.getChildren() ).some( function ( child ) {
						return child.is && child.is( 'element' );
					} );
					return hasElementChild ? null : { name: true };
				};
			}

			conversion.for( 'upcast' ).elementToAttribute( {
				view: viewMatcher,
				model: {
					key: modelKey,
					value: function ( viewElement ) {
						var attrs = {};
						Array.from( viewElement.getAttributeKeys() ).forEach( function ( key ) {
							if ( key === 'xmlns' ) {
								return;
							}
							attrs[ key ] = viewElement.getAttribute( key );
						} );
						return attrs;
					}
				}
			} );

			conversion.for( 'dataDowncast' ).attributeToElement( {
				model: modelKey,
				view: function ( attrsValue, api ) {
					return api.writer.createAttributeElement( entry.tag, attrsValue || {} );
				}
			} );

			conversion.for( 'editingDowncast' ).attributeToElement( {
				model: modelKey,
				view: function ( attrsValue, api ) {
					return aknInlineEditingElement( entry, attrsValue, api.writer );
				}
			} );
		} );
	}
}

class AknInlineToggleCommand extends CKE.Command {
	constructor( editor, modelKey ) {
		super( editor );
		this.modelKey = modelKey;
	}

	refresh() {
		var selection = this.editor.model.document.selection;
		this.isEnabled = this.editor.model.schema.checkAttributeInSelection( selection, this.modelKey );
		this.value = selection.hasAttribute( this.modelKey );
	}

	execute() {
		var model = this.editor.model;
		var modelKey = this.modelKey;
		var selection = model.document.selection;

		model.change( function ( writer ) {
			var alreadySet = selection.hasAttribute( modelKey );
			if ( selection.isCollapsed ) {
				if ( alreadySet ) {
					writer.removeSelectionAttribute( modelKey );
				} else {
					writer.setSelectionAttribute( modelKey, {} );
				}
				return;
			}
			var ranges = model.schema.getValidRanges( selection.getRanges(), modelKey );
			ranges.forEach( function ( range ) {
				if ( alreadySet ) {
					writer.removeAttribute( modelKey, range );
				} else {
					writer.setAttribute( modelKey, {}, range );
				}
			} );
		} );
	}
}

class AknAttrValueCommand extends CKE.Command {
	constructor( editor, modelKey, def, app ) {
		super( editor );
		this.modelKey = modelKey;
		this.def = def;
		this.app = app;
	}

	refresh() {
		var selection = this.editor.model.document.selection;
		this.isEnabled = !selection.isCollapsed &&
			this.editor.model.schema.checkAttributeInSelection( selection, this.modelKey );
	}

	execute() {
		var editor = this.editor;
		var modelKey = this.modelKey;
		var def = this.def;
		var ranges = Array.from( editor.model.document.selection.getRanges() );

		openAttrValueDialog( this.app, def, function ( value ) {
			var attrs = {};
			attrs[ def.attr ] = value;
			editor.model.change( function ( writer ) {
				ranges.forEach( function ( range ) {
					writer.setAttribute( modelKey, attrs, range );
				} );
			} );
		} );
	}
}

function buildAknRefPickerPlugin( app ) {
	class AknRefPickerCommand extends CKE.Command {
		constructor( editor, modelKey, def ) {
			super( editor );
			this.modelKey = modelKey;
			this.def = def;
		}

		refresh() {
			this.isEnabled = !this.editor.model.document.selection.isCollapsed;
		}

		execute() {
			var editor = this.editor;
			var ranges = Array.from( editor.model.document.selection.getRanges() );
			app.windowManager.openWindow( app.refDialog, {
				app: app,
				def: this.def,
				target: { mode: 'ckeditor', editor: editor, modelKey: this.modelKey },
				capturedModelRanges: ranges
			} );
		}
	}

	class AknRefPicker extends CKE.Plugin {
		init() {
			var editor = this.editor;

			[ 'ref', 'rref' ].forEach( function ( name ) {
				var entry = INLINE_TAG_BY_NAME[ name ];
				var modelKey = 'akn_' + entry.name;
				var commandName = 'akn-' + entry.name;

				editor.commands.add( commandName, new AknRefPickerCommand( editor, modelKey, entry ) );
				editor.ui.componentFactory.add( commandName, function ( locale ) {
					var command = editor.commands.get( commandName );
					var button = new CKE.ButtonView( locale );
					aknConfigureButton( button, entry );
					button.bind( 'isEnabled' ).to( command, 'isEnabled' );
					button.on( 'execute', function () { editor.execute( commandName ); } );
					return button;
				} );
			} );
		}
	}

	return AknRefPicker;
}

function buildAknInlineToolbarPlugin( app ) {
	class AknInlineToolbar extends CKE.Plugin {
		init() {
			var editor = this.editor;

			INLINE_TAGS_PRIMARY.concat( INLINE_TAGS_MORE ).forEach( function ( entry ) {
				if ( entry.picker ) {
					return;
				}
				var modelKey = 'akn_' + entry.name;
				var commandName = 'akn-' + entry.name;

				if ( entry.attr ) {
					editor.commands.add( commandName, new AknAttrValueCommand( editor, modelKey, entry, app ) );
				} else {
					editor.commands.add( commandName, new AknInlineToggleCommand( editor, modelKey ) );
				}

				editor.ui.componentFactory.add( commandName, function ( locale ) {
					var command = editor.commands.get( commandName );
					var button = new CKE.ButtonView( locale );
					aknConfigureButton( button, entry );
					button.bind( 'isEnabled' ).to( command, 'isEnabled' );
					if ( !entry.attr ) {
						button.bind( 'isOn' ).to( command, 'value' );
					}
					button.on( 'execute', function () {
						editor.execute( commandName );
						editor.editing.view.focus();
					} );
					return button;
				} );
			} );

			editor.ui.componentFactory.add( 'aknSemantic', function ( locale ) {
				var dropdown = CKE.createDropdown( locale );
				dropdown.buttonView.set( {
					label: mw.msg( 'aknedit-inline-semantic' ),
					icon: CKE.IconMarker,
					tooltip: true
				} );
				var buttons = aknSemanticNames().map( function ( name ) {
					return editor.ui.componentFactory.create( 'akn-' + name );
				} );
				CKE.addToolbarToDropdown( dropdown, buttons, {
					isVertical: true,
					class: 'akn-editor-semantic-dropdown'
				} );
				return dropdown;
			} );
		}
	}

	return AknInlineToolbar;
}

class AknDeleteTableCommand extends CKE.Command {
	refresh() {
		var position = this.editor.model.document.selection.getFirstPosition();
		this.isEnabled = !!position && !!position.findAncestor( 'table' );
	}

	execute() {
		var editor = this.editor;
		var position = editor.model.document.selection.getFirstPosition();
		var table = position && position.findAncestor( 'table' );
		if ( !table ) {
			return;
		}
		editor.model.change( function ( writer ) {
			writer.remove( table );
		} );
	}
}

function buildAknTablePlugin() {
	class AknTable extends CKE.Plugin {
		static get requires() {
			return [ CKE.Table, CKE.TableToolbar, CKE.TableUtils ];
		}

		init() {
			var editor = this.editor;
			var conversion = editor.conversion;

			editor.commands.add( 'aknDeleteTable', new AknDeleteTableCommand( editor ) );
			editor.ui.componentFactory.add( 'aknDeleteTable', function ( locale ) {
				var command = editor.commands.get( 'aknDeleteTable' );
				var button = new CKE.ButtonView( locale );
				button.set( { label: mw.msg( 'aknedit-table-delete' ), icon: CKE.IconRemove, tooltip: true } );
				button.bind( 'isEnabled' ).to( command, 'isEnabled' );
				button.on( 'execute', function () { editor.execute( 'aknDeleteTable' ); } );
				return button;
			} );

			conversion.for( 'dataDowncast' ).elementToElement( {
				model: 'table',
				view: function ( modelElement, api ) {
					return api.writer.createContainerElement( 'table' );
				},
				converterPriority: 'highest'
			} );
			conversion.for( 'dataDowncast' ).elementToElement( {
				model: 'tableRow',
				view: function ( modelElement, api ) {
					return api.writer.createContainerElement( 'tr' );
				},
				converterPriority: 'highest'
			} );
			conversion.for( 'dataDowncast' ).elementToElement( {
				model: 'tableCell',
				view: function ( modelElement, api ) {
					var parentRow = modelElement.parent;
					var rowIndex = parentRow.index;
					var headingRows = parentRow.parent.getAttribute( 'headingRows' ) || 0;
					var tag = rowIndex < headingRows ? 'th' : 'td';
					var colspan = modelElement.getAttribute( 'colspan' );
					var rowspan = modelElement.getAttribute( 'rowspan' );
					var attrs = {};
					if ( colspan && colspan !== 1 ) {
						attrs.colspan = colspan;
					}
					if ( rowspan && rowspan !== 1 ) {
						attrs.rowspan = rowspan;
					}
					return api.writer.createContainerElement( tag, attrs );
				},
				converterPriority: 'highest'
			} );

			conversion.for( 'upcast' ).add( function ( dispatcher ) {
				dispatcher.on( 'element:table', function ( evt, data, api ) {
					if ( !api.consumable.consume( data.viewItem, { name: true } ) ) {
						return;
					}
					var tableModel = api.writer.createElement( 'table' );
					if ( !api.safeInsert( tableModel, data.modelCursor ) ) {
						return;
					}

					var headingRows = 0;
					var sawNonHeadingRow = false;
					var rowViews = Array.from( data.viewItem.getChildren() ).filter( function ( child ) {
						return child.is && child.is( 'element', 'tr' );
					} );

					rowViews.forEach( function ( rowView ) {
						var rowModel = api.writer.createElement( 'tableRow' );
						api.writer.insert( rowModel, api.writer.createPositionAt( tableModel, 'end' ) );

						var cellViews = Array.from( rowView.getChildren() ).filter( function ( child ) {
							return child.is && ( child.is( 'element', 'td' ) || child.is( 'element', 'th' ) );
						} );
						var allHeading = cellViews.length > 0 && cellViews.every( function ( c ) {
							return c.is( 'element', 'th' );
						} );
						if ( allHeading && !sawNonHeadingRow ) {
							headingRows++;
						} else {
							sawNonHeadingRow = true;
						}

						cellViews.forEach( function ( cellView ) {
							var cellAttrs = {};
							if ( cellView.hasAttribute( 'colspan' ) ) {
								cellAttrs.colspan = parseInt( cellView.getAttribute( 'colspan' ), 10 );
							}
							if ( cellView.hasAttribute( 'rowspan' ) ) {
								cellAttrs.rowspan = parseInt( cellView.getAttribute( 'rowspan' ), 10 );
							}
							var cellModel = api.writer.createElement( 'tableCell', cellAttrs );
							api.writer.insert( cellModel, api.writer.createPositionAt( rowModel, 'end' ) );
							api.convertChildren( cellView, api.writer.createPositionAt( cellModel, 0 ) );
							if ( cellModel.isEmpty ) {
								api.writer.insert( api.writer.createElement( 'paragraph' ), api.writer.createPositionAt( cellModel, 0 ) );
							}
						} );
					} );

					if ( headingRows > 0 ) {
						api.writer.setAttribute( 'headingRows', headingRows, tableModel );
					}

					data.modelCursor = api.writer.createPositionAfter( tableModel );
					data.modelRange = api.writer.createRangeOn( tableModel );
				}, { priority: 'highest' } );
			} );
		}
	}

	return AknTable;
}

function buildAknBlockListPlugin() {
	class AknInsertBlockListCommand extends CKE.Command {
		execute() {
			var editor = this.editor;
			editor.model.change( function ( writer ) {
				var list = writer.createElement( 'aknBlockList' );
				[ 1, 2 ].forEach( function () {
					var item = writer.createElement( 'aknBlockListItem' );
					var num = writer.createElement( 'aknItemNum' );
					var body = writer.createElement( 'aknItemBody' );
					writer.append( num, item );
					writer.append( body, item );
					writer.append( writer.createElement( 'paragraph' ), body );
					writer.append( item, list );
				} );
				editor.model.insertContent( list );
			} );
		}
	}

	class AknBlockList extends CKE.Plugin {
		static get requires() {
			return [ CKE.Widget ];
		}

		init() {
			var editor = this.editor;
			var schema = editor.model.schema;
			var conversion = editor.conversion;

			schema.register( 'aknBlockList', { inheritAllFrom: '$blockObject' } );
			schema.register( 'aknBlockListItem', { allowIn: 'aknBlockList', isLimit: true } );
			schema.register( 'aknItemNum', { allowIn: 'aknBlockListItem', isLimit: true, allowChildren: '$text' } );
			schema.register( 'aknItemBody', { allowIn: 'aknBlockListItem', isLimit: true, allowContentOf: '$root' } );
			schema.extend( '$block', { allowIn: 'aknItemBody' } );
			schema.extend( '$text', { allowIn: 'aknItemNum' } );

			conversion.for( 'upcast' ).elementToElement( { view: 'blockList', model: 'aknBlockList' } );
			conversion.for( 'upcast' ).elementToElement( { view: 'item', model: 'aknBlockListItem' } );
			conversion.for( 'upcast' ).elementToElement( {
				view: function ( el ) {
					var matches = el.is && el.is( 'element', 'num' ) && el.parent && el.parent.is( 'element', 'item' );
					return matches ? { name: true } : null;
				},
				model: 'aknItemNum'
			} );
			conversion.for( 'upcast' ).elementToElement( {
				view: function ( el ) {
					var isBody = el.is && el.is( 'element' ) && el.parent && el.parent.is( 'element', 'item' ) && el.name !== 'num';
					return isBody ? { name: true } : null;
				},
				model: 'aknItemBody'
			} );

			conversion.for( 'dataDowncast' ).elementToElement( { model: 'aknBlockList', view: 'blockList' } );
			conversion.for( 'dataDowncast' ).elementToElement( { model: 'aknBlockListItem', view: 'item' } );
			conversion.for( 'dataDowncast' ).elementToElement( { model: 'aknItemNum', view: 'num' } );
			conversion.for( 'dataDowncast' ).elementToElement( {
				model: 'aknItemBody',
				view: 'akn-item-body-passthrough'
			} );

			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'aknBlockList',
				view: function ( modelElement, api ) {
					return CKE.toWidget(
						api.writer.createContainerElement( 'div', { class: 'akn-blockList' } ),
						api.writer,
						{ label: mw.msg( 'aknedit-inline-blocklist' ) }
					);
				}
			} );
			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'aknBlockListItem',
				view: function ( modelElement, api ) {
					return api.writer.createContainerElement( 'section', { class: 'akn-item akn-prov akn-editor-item' } );
				}
			} );
			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'aknItemNum',
				view: function ( modelElement, api ) {
					return CKE.toWidgetEditable(
						api.writer.createEditableElement( 'span', { class: 'akn-num' } ),
						api.writer
					);
				}
			} );
			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'aknItemBody',
				view: function ( modelElement, api ) {
					return CKE.toWidgetEditable(
						api.writer.createEditableElement( 'div', { class: 'akn-editor-item-body' } ),
						api.writer
					);
				}
			} );

			editor.commands.add( 'aknInsertBlockList', new AknInsertBlockListCommand( editor ) );
			editor.ui.componentFactory.add( 'aknInsertBlockList', function ( locale ) {
				var command = editor.commands.get( 'aknInsertBlockList' );
				var button = new CKE.ButtonView( locale );
				button.set( { label: mw.msg( 'aknedit-inline-blocklist' ), icon: CKE.IconBulletedList, tooltip: true } );
				button.bind( 'isEnabled' ).to( command, 'isEnabled' );
				button.on( 'execute', function () { editor.execute( 'aknInsertBlockList' ); } );
				return button;
			} );
		}
	}

	return AknBlockList;
}

function buildAknQuotedStructurePlugin() {
	class AknInsertQuotedStructureCommand extends CKE.Command {
		execute() {
			var editor = this.editor;
			editor.model.change( function ( writer ) {
				var quoted = writer.createElement( 'aknQuotedStructure' );
				var body = writer.createElement( 'aknQuotedStructureBody' );
				writer.append( writer.createElement( 'paragraph' ), body );
				writer.append( body, quoted );
				editor.model.insertContent( quoted );
			} );
		}
	}

	class AknQuotedStructure extends CKE.Plugin {
		static get requires() {
			return [ CKE.Widget ];
		}

		init() {
			var editor = this.editor;
			var schema = editor.model.schema;
			var conversion = editor.conversion;

			schema.register( 'aknQuotedStructure', { inheritAllFrom: '$blockObject' } );
			schema.register( 'aknQuotedStructureBody', { allowIn: 'aknQuotedStructure', isLimit: true, allowContentOf: '$root' } );
			schema.extend( '$block', { allowIn: 'aknQuotedStructureBody' } );

			function isEditableQuotedStructure( el ) {
				return Array.from( el.getChildren() ).every( function ( child ) {
					return !( child.is && child.is( 'element' ) ) || child.name === 'p';
				} );
			}

			conversion.for( 'upcast' ).elementToElement( {
				view: function ( el ) {
					var matches = el.is && el.is( 'element', 'quotedStructure' ) && isEditableQuotedStructure( el );
					return matches ? { name: true } : null;
				},
				model: 'aknQuotedStructure'
			} );
			conversion.for( 'upcast' ).elementToElement( {
				view: function ( el ) {
					var isBody = el.is && el.is( 'element', 'p' ) && el.parent &&
						el.parent.is( 'element', 'quotedStructure' ) && isEditableQuotedStructure( el.parent );
					return isBody ? { name: true } : null;
				},
				model: 'aknQuotedStructureBody'
			} );

			conversion.for( 'dataDowncast' ).elementToElement( { model: 'aknQuotedStructure', view: 'quotedStructure' } );
			conversion.for( 'dataDowncast' ).elementToElement( {
				model: 'aknQuotedStructureBody',
				view: 'akn-item-body-passthrough'
			} );

			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'aknQuotedStructure',
				view: function ( modelElement, api ) {
					return CKE.toWidget(
						api.writer.createContainerElement( 'div', { class: 'akn-quotedStructure' } ),
						api.writer,
						{ label: mw.msg( 'aknedit-inline-quotedstructure' ) }
					);
				}
			} );
			conversion.for( 'editingDowncast' ).elementToElement( {
				model: 'aknQuotedStructureBody',
				view: function ( modelElement, api ) {
					return CKE.toWidgetEditable(
						api.writer.createEditableElement( 'div', { class: 'akn-editor-quotedstructure-body' } ),
						api.writer
					);
				}
			} );

			editor.commands.add( 'aknInsertQuotedStructure', new AknInsertQuotedStructureCommand( editor ) );
			editor.ui.componentFactory.add( 'aknInsertQuotedStructure', function ( locale ) {
				var command = editor.commands.get( 'aknInsertQuotedStructure' );
				var button = new CKE.ButtonView( locale );
				button.set( { label: mw.msg( 'aknedit-inline-quotedstructure' ), icon: CKE.IconQuote, tooltip: true } );
				button.bind( 'isEnabled' ).to( command, 'isEnabled' );
				button.on( 'execute', function () { editor.execute( 'aknInsertQuotedStructure' ); } );
				return button;
			} );
		}
	}

	return AknQuotedStructure;
}

function aknInlineToolbarItemNames() {
	return AKN_FORMAT_NAMES.map( function ( name ) {
		return 'akn-' + name;
	} ).concat( [ 'aknSemantic' ] );
}
