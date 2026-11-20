/**
 * A deep merge, as jQuery's `$.extend( true, … )` merged.
 *
 * How a chart's own options are laid over the report's look: objects merge
 * key by key, a list merges item by item into the list beneath it (or is
 * copied, when there is none), and `undefined` changes nothing.
 */

/**
 * Whether a value is a plain object: `{}` or `Object.create( null )`.
 *
 * @param {*} value The value.
 * @return {boolean} A plain object.
 */
export function isPlainObject( value ) {
	if (
		! value ||
		Object.prototype.toString.call( value ) !== '[object Object]'
	) {
		return false;
	}

	const proto = Object.getPrototypeOf( value );

	return (
		proto === null ||
		( Object.prototype.hasOwnProperty.call( proto, 'constructor' ) &&
			proto.constructor === Object )
	);
}

/**
 * Merge sources into a target, deeply.
 *
 * @param {Object|Array} target     What is merged into, and returned.
 * @param {...Object}    sourceList What is laid over it, in order.
 * @return {Object|Array} The target.
 */
export function merge( target, ...sourceList ) {
	sourceList.forEach( ( source ) => {
		if ( source === null || source === undefined ) {
			return;
		}

		for ( const name in source ) {
			const copy = source[ name ];

			// Nothing that would change Object.prototype, and no loop.
			if ( name === '__proto__' || target === copy ) {
				continue;
			}

			const copyIsArray = Array.isArray( copy );

			if ( copy && ( copyIsArray || isPlainObject( copy ) ) ) {
				const existing = target[ name ];
				let clone = existing;

				if ( copyIsArray && ! Array.isArray( existing ) ) {
					clone = [];
				} else if ( ! copyIsArray && ! isPlainObject( existing ) ) {
					clone = {};
				}

				target[ name ] = merge( clone, copy );
			} else if ( copy !== undefined ) {
				target[ name ] = copy;
			}
		}
	} );

	return target;
}
