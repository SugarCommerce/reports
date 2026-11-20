/**
 * A report screen, put together: the notices and the section row tidied,
 * the date picker, filters, tables, exports, Refresh and Screen Options
 * listened to, the charts drawn, the tables paged and the refresh timer
 * started -- in that order, as the page always did it.
 */

import { on } from '../lib/dom';
import { createRest } from '../lib/rest';
import { translator } from '../lib/text';
import { createCharts } from './charts/charts';
import { updateComponents } from './components';
import { bindDatePicker } from './date-picker';
import { bindExports } from './exports';
import { bindFilters, markAutoForms } from './filters';
import { repositionNotices, revealCurrentSection } from './page';
import { createRefresh } from './refresh';
import { bindScreenOptions } from './screen-options';
import { initPagination, bindPaging } from './tables/paging';
import { readTableConfigs, updateTable } from './tables/rows';
import { bindSorting } from './tables/sort';

/**
 * Start the report on a page.
 *
 * @param {Document} root             The page.
 * @param {Object}   options          What it needs.
 * @param {Object}   options.settings What PHP handed over (lib/config).
 * @param {Function} options.apiFetch wp.apiFetch.
 * @param {Function} options.Chart    Chart.js's Chart.
 * @param {Function} options.href     The address now.
 * @param {Function} options.navigate Loads an address.
 * @param {Function} options.reload   Loads the page again.
 * @param {Object=}  options.log      Where a failed refresh is reported.
 * @return {Object} The parts, for the tests: charts, tables, refresh.
 */
export function initReports(
	root,
	{ settings, apiFetch, Chart, href, navigate, reload, log }
) {
	const t = translator( settings.i18n );
	const rest = createRest( apiFetch, settings.restNonce );
	const url = settings.restUrl;
	const preset = settings.defaultPreset;
	const charts = createCharts( {
		Chart,
		palette: settings.chartDefaults?.colors,
		t,
	} );
	let tables = {};

	const refresh = createRefresh( root, {
		rest,
		url,
		preset,
		href,
		t,
		log,
		update: ( components ) =>
			updateComponents( root, components, {
				icons: settings.changeIcons,
				chart: charts.update,
				table: ( wrapper, id, values ) =>
					updateTable( wrapper, tables[ id ], values, t ),
			} ),
	} );

	repositionNotices( root );
	revealCurrentSection( root );

	bindDatePicker( root, { href, navigate } );
	markAutoForms( root );
	bindFilters( root );
	bindSorting( root );
	bindPaging( root, t );
	bindExports( root, { rest, url, preset, href, navigate, t } );
	on( root, 'click', '.reports-refresh-button', ( event ) => {
		event.preventDefault();
		refresh.refresh();
	} );
	bindScreenOptions( root, { rest, url, reload } );

	charts.init( root );
	charts.sparklines( root );
	tables = readTableConfigs( root, t );
	initPagination( root, t );
	refresh.start();

	return { charts, tables, refresh };
}
