/**
 * A query string, written as jQuery's `$.param()` wrote it.
 *
 * The refresh's GET has always been sent this way, and the REST route reads
 * it as PHP parses it: a list is repeated `name[]` keys (a multiselect's
 * `filter_status[]=complete&filter_status[]=refunded`), an object is
 * `name[key]`, a list of objects counts them, and nothing is `name=`.
 */

/**
 * The types jQuery names, which are values rather than objects to spell
 * out key by key.
 */
const TYPED = [
	'Boolean',
	'Number',
	'String',
	'Function',
	'Array',
	'Date',
	'RegExp',
	'Error',
	'Symbol',
];

/**
 * Whether a value is an object to spell out key by key: not a date, a
 * function or anything else with a type of its own.
 *
 * @param {*} value The value.
 * @return {boolean} An object.
 */
const isObject = ( value ) =>
	value !== null &&
	( typeof value === 'object' || typeof value === 'function' ) &&
	TYPED.indexOf( Object.prototype.toString.call( value ).slice( 8, -1 ) ) ===
		-1;

/**
 * Add one value, and everything inside it, under a name.
 *
 * @param {string}   prefix The name so far.
 * @param {*}        value  The value.
 * @param {Function} add    Takes ( name, value ).
 */
function build( prefix, value, add ) {
	if ( Array.isArray( value ) ) {
		value.forEach( ( item, index ) => {
			if ( /\[\]$/.test( prefix ) ) {
				add( prefix, item );
			} else {
				build(
					prefix +
						'[' +
						( typeof item === 'object' && item !== null
							? index
							: '' ) +
						']',
					item,
					add
				);
			}
		} );

		return;
	}

	if ( isObject( value ) ) {
		for ( const name in value ) {
			build( prefix + '[' + name + ']', value[ name ], add );
		}

		return;
	}

	add( prefix, value );
}

/**
 * Data as a query string.
 *
 * @param {Object|null} params Names and values.
 * @return {string} `a=1&b%5B%5D=2`, or an empty string.
 */
export function param( params ) {
	const pairs = [];

	const add = ( name, value ) => {
		const resolved = typeof value === 'function' ? value() : value;

		pairs.push(
			encodeURIComponent( name ) +
				'=' +
				encodeURIComponent(
					resolved === null || resolved === undefined ? '' : resolved
				)
		);
	};

	if ( params === null || params === undefined ) {
		return '';
	}

	for ( const name in params ) {
		build( name, params[ name ], add );
	}

	return pairs.join( '&' );
}
