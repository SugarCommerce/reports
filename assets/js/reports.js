/**
 * A report screen: the date range, refreshing in place, the charts, the
 * tables' pages and sorting, the CSV exports and Screen Options.
 *
 * Loaded by Traits\AssetManager on the report's own screen, under the
 * copy's handle, with its settings published before it. Chart.js (MIT,
 * https://www.chartjs.org) is bundled in, with every chart type, scale and
 * plugin registered, as the file it replaces had them.
 */

import apiFetch from '@wordpress/api-fetch';
import domReady from '@wordpress/dom-ready';
import Chart from 'chart.js/auto';

import { config } from './lib/config';
import { initReports } from './reports/init';

const settings = config();

domReady( () => {
	initReports( document, {
		settings,
		apiFetch,
		Chart,
		href: () => window.location.href,
		navigate: ( address ) => {
			window.location.href = address;
		},
		reload: () => window.location.reload(),
	} );
} );
