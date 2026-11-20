/**
 * The script's words, which PHP translated and handed over in `i18n`.
 */

/**
 * Fill a sentence's placeholders: `%1$d`, `%2$s` by position, then `%d`
 * and `%s` in order. A placeholder with no value is left as it is.
 *
 * @param {string} text   The sentence.
 * @param {Array}  values The values.
 * @return {string} The sentence filled in.
 */
export function fill( text, values ) {
	if ( values.length === 0 ) {
		return text;
	}

	let next = 0;

	return text
		.replace( /%(\d+)\$([sd])/g, ( match, position ) => {
			const value = values[ parseInt( position, 10 ) - 1 ];

			return value !== undefined ? value : match;
		} )
		.replace( /%([sd])/g, ( match ) =>
			values[ next ] !== undefined ? values[ next++ ] : match
		);
}

/**
 * A function that says one of the script's words.
 *
 * Settings with no `i18n` -- no entry matched the handle -- answer with the
 * key itself: an untranslated word beats a dead page.
 *
 * @param {Object|undefined} strings Key => sentence.
 * @return {Function} ( key, ...values ) => the sentence.
 */
export const translator =
	( strings ) =>
	( key, ...values ) =>
		fill( ( strings || {} )[ key ] || key, values );
