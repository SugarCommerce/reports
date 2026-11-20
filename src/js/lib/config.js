/**
 * What PHP handed the script.
 *
 * The only module that reads the page's globals. Each Strauss-prefixed copy
 * of the library loads its own build under its own handle, so a shared
 * global would leave two plugins on one screen reading the same REST
 * namespace and nonce. Traits\AssetManager::localize_scripts() publishes
 * each copy's settings into `window.SugarCommerceReports`, keyed by handle,
 * and the script finds its own from the id WordPress stamps on its tag
 * (`{handle}-js`). The unprefixed copy's localized object,
 * `window.SugarcommerceReportsAdmin`, is the fallback, as it always was.
 */

/**
 * The handle a script tag was printed for.
 *
 * @param {HTMLScriptElement|null} script The tag.
 * @return {string} The handle, or an empty string.
 */
export const handleOf = ( script ) =>
	script && script.id ? script.id.replace( /-js$/, '' ) : '';

/**
 * The settings for the copy a script tag belongs to.
 *
 * @param {HTMLScriptElement|null} script The tag.
 * @param {Window}                 win    Where the settings were printed.
 * @return {Object} Its settings, or an empty object.
 */
export function resolveConfig( script, win = window ) {
	const registry = win.SugarCommerceReports || {};

	return (
		registry[ handleOf( script ) ] || win.SugarcommerceReportsAdmin || {}
	);
}

// Read while the build runs: document.currentScript is its own tag only now,
// not once the page is ready.
const own = resolveConfig( document.currentScript );

/**
 * This copy's settings.
 *
 * @return {Object} restUrl, restNonce, reportId, defaultPreset, i18n,
 *                  changeIcons and chartDefaults.
 */
export const config = () => own;
