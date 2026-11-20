/**
 * What the address says the report is showing: the tab, the period and
 * the filters. The page was drawn from these, so a refresh or an export
 * asks for the same thing by reading them back.
 */

/**
 * One query argument.
 *
 * @param {string} href The address.
 * @param {string} name The argument.
 * @return {string} Its value, or an empty string.
 */
const arg = ( href, name ) => new URL( href ).searchParams.get( name ) || '';

/**
 * The tab. None means the first one, which PHP works out.
 *
 * @param {string} href The address.
 * @return {string} The tab, or an empty string.
 */
export const currentTab = ( href ) => arg( href, 'tab' );

/**
 * The period's preset.
 *
 * A missing one means the report's own default, which PHP hands over: the
 * script used to answer this_month regardless, so a report configuring
 * another default got it on the first render and lost it on the first
 * refresh.
 *
 * @param {string}  href     The address.
 * @param {string=} fallback The report's default_preset.
 * @return {string} The preset.
 */
export const currentPreset = ( href, fallback ) =>
	arg( href, 'date_preset' ) || fallback || 'this_month';

/**
 * A custom period's first day.
 *
 * @param {string} href The address.
 * @return {string} YYYY-MM-DD, or an empty string.
 */
export const currentStart = ( href ) => arg( href, 'date_start' );

/**
 * A custom period's last day.
 *
 * @param {string} href The address.
 * @return {string} YYYY-MM-DD, or an empty string.
 */
export const currentEnd = ( href ) => arg( href, 'date_end' );

/**
 * Every `filter_*` argument.
 *
 * A multiselect submits its values as repeated `filter_status[]` keys.
 * Read one key at a time, each repeat overwrote the last and the refresh
 * carried a single value where the page had several -- so the numbers
 * changed on refresh for no visible reason. The bracketed keys are
 * gathered into a list under the bare name, which the query string writes
 * back as the same repeated keys.
 *
 * @param {string} href The address.
 * @return {Object} Name => value, or name => list.
 */
export function currentFilters( href ) {
	const filters = {};

	new URL( href ).searchParams.forEach( ( value, key ) => {
		if ( key.indexOf( 'filter_' ) !== 0 ) {
			return;
		}

		if ( key.slice( -2 ) === '[]' ) {
			const name = key.slice( 0, -2 );

			filters[ name ] = filters[ name ] || [];
			filters[ name ].push( value );

			return;
		}

		filters[ key ] = value;
	} );

	return filters;
}

/**
 * The address for another period: the preset, and a custom period's days.
 *
 * @param {string}  href   The address now.
 * @param {string}  preset The preset key.
 * @param {string=} start  A custom period's first day.
 * @param {string=} end    Its last day.
 * @return {string} The address to load.
 */
export function rangeUrl( href, preset, start, end ) {
	const url = new URL( href );

	url.searchParams.set( 'date_preset', preset );

	if ( preset === 'custom' && start && end ) {
		url.searchParams.set( 'date_start', start );
		url.searchParams.set( 'date_end', end );
	} else {
		url.searchParams.delete( 'date_start' );
		url.searchParams.delete( 'date_end' );
	}

	return url.toString();
}
