/**
 * An element's data, read as jQuery's `.data()` read it.
 *
 * The page's `data-*` attributes are read once and kept, and turned into
 * what they say: `"true"` is true, `"5"` is 5, `{…}` and `[…]` are parsed
 * -- so a chart's configuration arrives as an object and a report id of
 * digits is the number the requests always carried. A value the script
 * sets (the page a table is on, the page a button goes to) is kept beside
 * them and never written to the page.
 */

/**
 * What has been read or set, per element.
 *
 * @type {WeakMap<Element, Object>}
 */
const store = new WeakMap();

/**
 * A data attribute's text as the value it stands for.
 *
 * @param {string} text The attribute.
 * @return {*} true, false, null, a number, parsed JSON, or the text.
 */
export function parseData( text ) {
	if ( text === 'true' ) {
		return true;
	}

	if ( text === 'false' ) {
		return false;
	}

	if ( text === 'null' ) {
		return null;
	}

	// A number only when it reads back the same: "1.0" and "007" stay text.
	if ( text === +text + '' ) {
		return +text;
	}

	if ( /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/.test( text ) ) {
		try {
			return JSON.parse( text );
		} catch {
			return text;
		}
	}

	return text;
}

/**
 * The name a data key is kept under: `chart-config` is `chartConfig`.
 *
 * @param {string} key A key, dashed or not.
 * @return {string} The key, camel-cased.
 */
const camel = ( key ) =>
	key.replace( /-([a-z])/g, ( match, letter ) => letter.toUpperCase() );

/**
 * The values kept for an element.
 *
 * @param {Element} element The element.
 * @return {Object} Its values.
 */
function kept( element ) {
	if ( ! store.has( element ) ) {
		store.set( element, {} );
	}

	return store.get( element );
}

/**
 * One of an element's values: what was set, or else its attribute.
 *
 * @param {Element|null} element The element.
 * @param {string}       key     The key, as `chart-config`.
 * @return {*} The value, or undefined.
 */
export function data( element, key ) {
	if ( ! element ) {
		return undefined;
	}

	const name = camel( key );
	const values = kept( element );

	if ( values[ name ] !== undefined ) {
		return values[ name ];
	}

	const text = element.getAttribute(
		'data-' + name.replace( /[A-Z]/g, '-$&' ).toLowerCase()
	);

	if ( typeof text !== 'string' ) {
		return undefined;
	}

	values[ name ] = parseData( text );

	return values[ name ];
}

/**
 * Keep a value for an element, without writing it to the page.
 *
 * @param {Element|null} element The element.
 * @param {string}       key     The key.
 * @param {*}            value   The value.
 */
export function setData( element, key, value ) {
	if ( element ) {
		kept( element )[ camel( key ) ] = value;
	}
}
