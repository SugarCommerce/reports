/**
 * The report put together, and what its sources must never do again.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
	cleanup,
	click,
	FakeChart,
	layout,
	reportPage,
	startReport,
} from './support/page';

beforeEach( layout );
afterEach( cleanup );

/**
 * Every source file's text, by path.
 *
 * @param {string} dir A folder.
 * @return {Object<string, string>} Path => text.
 */
function sources( dir = join( __dirname, '../../src/js' ) ) {
	return readdirSync( dir ).reduce( ( found, name ) => {
		const path = join( dir, name );

		return statSync( path ).isDirectory()
			? { ...found, ...sources( path ) }
			: { ...found, [ path ]: readFileSync( path, 'utf8' ) };
	}, {} );
}

describe( 'a report screen', () => {
	test( 'a page with no report on it: nothing breaks', () => {
		expect( () =>
			startReport( { html: '<p>Another screen.</p>' } )
		).not.toThrow();
		expect( () => click( document.querySelector( 'p' ) ) ).not.toThrow();
	} );

	test( 'settings with nothing in them: nothing breaks', () => {
		expect( () =>
			startReport( {
				settings: {
					i18n: undefined,
					chartDefaults: undefined,
					changeIcons: undefined,
				},
			} )
		).not.toThrow();
		// No words handed over: the key, rather than a dead page.
		expect(
			document.querySelector( '.reports-table-info' ).textContent
		).toBe( 'showing' );
	} );

	test( 'drawn: the chart, the paged table, the notices gathered', () => {
		const { charts, tables } = startReport();

		expect( FakeChart.made ).toHaveLength( 1 );
		expect( charts.charts.over_time ).toBe( FakeChart.made[ 0 ] );
		expect( Object.keys( tables ) ).toEqual( [ 'orders_table' ] );
		expect(
			document.querySelectorAll( '.reports-notices .notice' )
		).toHaveLength( 4 );
	} );

	test( 'the same page twice draws the same', () => {
		startReport();

		const first = document.body.innerHTML;

		cleanup();
		document.body.innerHTML = reportPage();
		startReport( { html: document.body.innerHTML } );

		expect( document.body.innerHTML ).toBe( first );
	} );
} );

describe( 'the sources', () => {
	const files = sources();

	// The code, without the comments that explain what it replaced.
	const all = Object.values( files )
		.join( '\n' )
		.replace( /\/\*[\s\S]*?\*\//g, '' )
		.replace( /^\s*\/\/.*$/gm, '' );

	test( 'no jQuery, no globals but the settings', () => {
		expect( all ).not.toMatch(
			/\bjQuery\s*\(|window\.jQuery|\$\.(ajax|each|extend|param)\b/
		);
		expect( all ).not.toMatch( /window\.wp\b|wp\.apiFetch\(/ );

		// Only lib/config reads what PHP printed.
		expect(
			Object.keys( files ).filter( ( path ) =>
				/Sugar[Cc]ommerceReports/.test( files[ path ] )
			)
		).toEqual( [ join( __dirname, '../../src/js/lib/config.js' ) ] );
	} );

	test( 'no global Chart and no ReportsController', () => {
		expect( all ).not.toMatch( /window\.(Chart|ReportsController)\s*=/ );
	} );

	test( 'cells are not formatted again in the browser', () => {
		// The server formats them with the code that renders the page; a
		// second formatter is how the refresh came to print dollars on a
		// site set to euros.
		[
			'formatCellValue',
			'formatCurrency',
			'formatNumber',
			'formatDateTime',
			'Intl.NumberFormat',
			'toLocaleString',
		].forEach( ( name ) => expect( all ).not.toContain( name ) );
	} );

	test( 'no Dashicons are built', () => {
		expect( all ).not.toMatch( /dashicons/ );
	} );
} );
