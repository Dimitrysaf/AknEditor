'use strict';

function AttrField( getElement, attr ) {
	this.getElement = getElement;
	this.attr = attr;
}

AttrField.prototype.get = function () {
	var el = this.getElement( false );
	return el ? el.getAttribute( this.attr ) || '' : '';
};

AttrField.prototype.set = function ( value ) {
	var el = this.getElement( true );
	if ( value === '' ) {
		el.removeAttribute( this.attr );
	} else {
		el.setAttribute( this.attr, value );
	}
};
