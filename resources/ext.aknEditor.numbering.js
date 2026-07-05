'use strict';

var AKN_DISPLAY_TYPES = [ 'part', 'section', 'subsection', 'chapter', 'subchapter', 'article' ];

var GREEK_ORDINALS = [ 'Πρώτο', 'Δεύτερο', 'Τρίτο', 'Τέταρτο', 'Πέμπτο', 'Έκτο', 'Έβδομο', 'Όγδοο',
	'Ένατο', 'Δέκατο', 'Ενδέκατο', 'Δωδέκατο', 'Δέκατο Τρίτο', 'Δέκατο Τέταρτο', 'Δέκατο Πέμπτο',
	'Δέκατο Έκτο', 'Δέκατο Έβδομο', 'Δέκατο Όγδοο', 'Δέκατο Ένατο', 'Εικοστό' ];

var GREEK_LETTERS = [ 'Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ', 'Ζ', 'Η', 'Θ', 'Ι', 'ΙΑ', 'ΙΒ', 'ΙΓ', 'ΙΔ',
	'ΙΕ', 'ΙΣΤ', 'ΙΖ', 'ΙΗ', 'ΙΘ', 'Κ', 'ΚΑ', 'ΚΒ', 'ΚΓ', 'ΚΔ', 'ΚΕ', 'ΚΣΤ', 'ΚΖ', 'ΚΗ', 'ΚΘ', 'Λ' ];

var GREEK_LOWER = [ 'α', 'β', 'γ', 'δ', 'ε', 'στ', 'ζ', 'η', 'θ', 'ι', 'ια', 'ιβ', 'ιγ', 'ιδ',
	'ιε', 'ιστ', 'ιζ', 'ιη', 'ιθ', 'κ', 'κα', 'κβ', 'κγ', 'κδ', 'κε', 'κστ', 'κζ', 'κη', 'κθ', 'λ' ];

function greekOrdinal( n ) {
	return GREEK_ORDINALS[ n - 1 ] || String( n );
}

function greekLetter( n ) {
	return ( GREEK_LETTERS[ n - 1 ] || String( n ) ) + "'";
}

function greekLowerLetter( n ) {
	return GREEK_LOWER[ n - 1 ] || String( n );
}

var AKN_NUM_FORMATS = {
	part: function ( n ) { return 'Μέρος ' + greekOrdinal( n ); },
	section: function ( n ) { return 'Τμήμα ' + greekLetter( n ); },
	subsection: function ( n ) { return 'Υποτμήμα ' + greekLetter( n ); },
	chapter: function ( n ) { return 'Κεφάλαιο ' + greekOrdinal( n ); },
	subchapter: function ( n ) { return 'Υποκεφάλαιο ' + greekLetter( n ); },
	article: function ( n ) { return 'Άρθρο ' + n; }
};

var AKN_EID_PREFIX = {
	part: 'part',
	section: 'section',
	subsection: 'subsec',
	chapter: 'chapter',
	subchapter: 'subchap',
	article: 'art'
};

function aknSetNumText( doc, el, text ) {
	var num = firstChild( el, 'num' );
	if ( !num ) {
		num = doc.createElementNS( AKN_NS, 'num' );
		el.insertBefore( num, el.firstChild );
	}
	num.textContent = text;
}

function aknPointNumFor( index, depth ) {
	var letter = greekLowerLetter( index );
	if ( depth > 1 ) {
		letter = letter + letter;
	}
	return letter;
}

function aknRenumberPoints( doc, containerEl, parentEid, depth, remap ) {
	var listIndex = 0;
	Array.prototype.slice.call( containerEl.children ).forEach( function ( child ) {
		if ( child.localName !== 'list' ) {
			return;
		}
		listIndex++;
		var listEid = parentEid + '__list_' + listIndex;
		aknAssignEid( child, listEid, remap );
		var pointIndex = 0;
		Array.prototype.slice.call( child.children ).forEach( function ( point ) {
			if ( point.localName !== 'point' ) {
				return;
			}
			pointIndex++;
			var letter = aknPointNumFor( pointIndex, depth );
			aknSetNumText( doc, point, letter + ')' );
			var pointEid = listEid + '__point_' + letter;
			aknAssignEid( point, pointEid, remap );
			var pointContent = firstChild( point, 'content' );
			if ( pointContent ) {
				aknRenumberPoints( doc, pointContent, pointEid, depth + 1, remap );
			}
			aknRenumberPoints( doc, point, pointEid, depth + 1, remap );
		} );
	} );
}

function aknAssignEid( el, eid, remap ) {
	var old = el.getAttribute( 'eId' );
	if ( old && old !== eid ) {
		remap[ '#' + old ] = '#' + eid;
	}
	el.setAttribute( 'eId', eid );
}

function aknRenumberArticleInternals( doc, articleEl, remap ) {
	var articleEid = articleEl.getAttribute( 'eId' );
	var paraIndex = 0;
	Array.prototype.slice.call( articleEl.children ).forEach( function ( child ) {
		if ( child.localName !== 'paragraph' ) {
			return;
		}
		paraIndex++;
		aknSetNumText( doc, child, paraIndex + '.' );
		var paraEid = articleEid + '__para_' + paraIndex;
		aknAssignEid( child, paraEid, remap );
		var subIndex = 0;
		Array.prototype.slice.call( child.children ).forEach( function ( sub ) {
			if ( sub.localName === 'subparagraph' ) {
				subIndex++;
				aknAssignEid( sub, paraEid + '__subpar_' + subIndex, remap );
			}
		} );
		var content = firstChild( child, 'content' );
		if ( content ) {
			aknRenumberPoints( doc, content, paraEid, 1, remap );
		}
		aknRenumberPoints( doc, child, paraEid, 1, remap );
	} );
}

function aknAutoNumber( doc, body ) {
	var remap = {};
	var globalCounters = {};
	var articles = [];

	function walk( parent ) {
		var scopeCounters = {};
		Array.prototype.forEach.call( parent.children, function ( child ) {
			var type = child.localName;
			if ( AKN_DISPLAY_TYPES.indexOf( type ) === -1 ) {
				return;
			}
			globalCounters[ type ] = ( globalCounters[ type ] || 0 ) + 1;
			scopeCounters[ type ] = ( scopeCounters[ type ] || 0 ) + 1;
			var numIndex = type === 'article' || type === 'part' ? globalCounters[ type ] : scopeCounters[ type ];
			aknSetNumText( doc, child, AKN_NUM_FORMATS[ type ]( numIndex ) );
			aknAssignEid( child, AKN_EID_PREFIX[ type ] + '_' + globalCounters[ type ], remap );
			if ( type === 'article' ) {
				articles.push( child );
			} else {
				walk( child );
			}
		} );
	}

	if ( body ) {
		walk( body );
		articles.forEach( function ( article ) {
			aknRenumberArticleInternals( doc, article, remap );
		} );
	}

	if ( Object.keys( remap ).length ) {
		Array.prototype.forEach.call( doc.querySelectorAll( '[href]' ), function ( el ) {
			var href = el.getAttribute( 'href' );
			if ( remap[ href ] ) {
				el.setAttribute( 'href', remap[ href ] );
			}
		} );
	}
	return remap;
}

function aknArticleToEditorXml( articleEl ) {
	var doc = articleEl.ownerDocument;
	var clone = articleEl.cloneNode( true );

	function listToOl( listEl ) {
		var ol = doc.createElementNS( AKN_NS, 'ol' );
		Array.prototype.slice.call( listEl.children ).forEach( function ( point ) {
			if ( point.localName !== 'point' ) {
				return;
			}
			ol.appendChild( itemToLi( point ) );
		} );
		return ol;
	}

	function itemToLi( el ) {
		var li = doc.createElementNS( AKN_NS, 'li' );
		Array.prototype.slice.call( el.children ).forEach( function ( child ) {
			if ( child.localName === 'num' ) {
				return;
			}
			if ( child.localName === 'content' || child.localName === 'subparagraph' ) {
				var inner = child.localName === 'subparagraph' ? ( firstChild( child, 'content' ) || child ) : child;
				Array.prototype.slice.call( inner.children ).forEach( function ( grandchild ) {
					if ( grandchild.localName === 'list' ) {
						li.appendChild( listToOl( grandchild ) );
					} else {
						li.appendChild( grandchild.cloneNode( true ) );
					}
				} );
				return;
			}
			if ( child.localName === 'list' ) {
				li.appendChild( listToOl( child ) );
				return;
			}
			li.appendChild( child.cloneNode( true ) );
		} );
		if ( !li.firstChild ) {
			li.appendChild( doc.createElementNS( AKN_NS, 'p' ) );
		}
		return li;
	}

	var paragraphRun = null;
	Array.prototype.slice.call( clone.children ).forEach( function ( child ) {
		if ( child.localName === 'paragraph' ) {
			if ( !paragraphRun ) {
				paragraphRun = doc.createElementNS( AKN_NS, 'ol' );
				clone.insertBefore( paragraphRun, child );
			}
			paragraphRun.appendChild( itemToLi( child ) );
			clone.removeChild( child );
		} else if ( child.localName !== 'num' && child.localName !== 'heading' ) {
			paragraphRun = null;
		}
	} );

	return new XMLSerializer().serializeToString( clone );
}

function aknEditorListsToAkn( doc, containerEl ) {
	function liToElement( li, tagName ) {
		var el = doc.createElementNS( AKN_NS, tagName );
		var content = doc.createElementNS( AKN_NS, 'content' );
		el.appendChild( doc.createElementNS( AKN_NS, 'num' ) );
		el.appendChild( content );
		Array.prototype.slice.call( li.childNodes ).forEach( function ( child ) {
			if ( child.nodeType === 1 && ( child.localName === 'ol' || child.localName === 'ul' ) ) {
				content.appendChild( olToList( child ) );
			} else {
				content.appendChild( child.cloneNode( true ) );
			}
		} );
		if ( !content.firstChild ) {
			content.appendChild( doc.createElementNS( AKN_NS, 'p' ) );
		}
		return el;
	}

	function olToList( ol ) {
		var list = doc.createElementNS( AKN_NS, 'list' );
		Array.prototype.slice.call( ol.children ).forEach( function ( li ) {
			if ( li.localName === 'li' ) {
				list.appendChild( liToElement( li, 'point' ) );
			}
		} );
		return list;
	}

	Array.prototype.slice.call( containerEl.querySelectorAll( 'article' ) ).forEach( function ( article ) {
		Array.prototype.slice.call( article.children ).forEach( function ( child ) {
			if ( child.localName !== 'ol' && child.localName !== 'ul' ) {
				return;
			}
			Array.prototype.slice.call( child.children ).forEach( function ( li ) {
				if ( li.localName === 'li' ) {
					article.insertBefore( liToElement( li, 'paragraph' ), child );
				}
			} );
			article.removeChild( child );
		} );
	} );
}

function aknSkeletonDocument() {
	return '<akomaNtoso xmlns="' + AKN_NS + '">' +
		'<act name="nomos">' +
		'<meta>' +
		'<identification source="#source">' +
		'<FRBRWork>' +
		'<FRBRalias value=""/>' +
		'<FRBRnumber value=""/>' +
		'<FRBRdate name="enacted" date=""/>' +
		'<FRBRcountry value="gr"/>' +
		'</FRBRWork>' +
		'<FRBRExpression><FRBRlanguage language="ell"/></FRBRExpression>' +
		'</identification>' +
		'</meta>' +
		'<body>' +
		'<article eId="art_1">' +
		'<num>Άρθρο 1</num>' +
		'<heading></heading>' +
		'<paragraph eId="art_1__para_1"><num>1.</num><content><p></p></content></paragraph>' +
		'</article>' +
		'</body>' +
		'</act>' +
		'</akomaNtoso>';
}
