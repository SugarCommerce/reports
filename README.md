# Reports

An analytics screen for a WordPress plugin — tiles, charts, funnels, tables
and a date range — from a description of what to show.

## What it does

A reports page is the same furniture every time: a date-range control, tabs,
filters, a row of headline figures, some charts and a table or two, all
reloading together when the range changes.

None of that is the interesting part. This builds it, and asks you only for
the callbacks that fetch the numbers.

## Features

* Get a reports screen with a date-range picker and comparison periods
* Show headline figures as tiles, with the change against the previous period
* Add line, bar and pie charts without touching a charting library
* Draw money, counts on a second axis, bars and a line together, with a figure and a sentence above
* Show a funnel: steps side by side, with how many carried on from each
* Put a sentence across a tab that takes no room when it has nothing to say
* Add a data table, sortable and paged, beside them
* Group everything into tabs, each with its own filters
* Refresh in place when the range or a filter changes, without a page load
* Offer a CSV export of what is on screen, batched so it does not time out
* Let each person hide the components they do not read, per tab, from Screen Options

## Installation

```bash
composer require sugarcommerce/reports
```

## Quick start

```php
use SugarCommerce\Reports\Reports;

Reports::register( 'my-analytics', [
	'page_title'  => __( 'Analytics', 'my-plugin' ),
	'menu_title'  => __( 'Analytics', 'my-plugin' ),
	'parent_slug' => 'tools.php',

	'tabs'        => [
		'overview' => [ 'label' => __( 'Overview', 'my-plugin' ) ],
	],

	'components'  => [
		'revenue' => [
			'type'          => 'tile',
			'tab'           => 'overview',
			'title'         => __( 'Revenue', 'my-plugin' ),
			'value_format'  => 'currency',
			'data_callback' => '\MyPlugin\get_revenue',
		],
	],
] );
```

`data_callback` is handed the date range and the active filters, and returns
a number. The tile, its formatting and the comparison against the previous
period are not yours to build.

## Charts

A chart's `data_callback` returns `labels` and `datasets`, as Chart.js has
them. `Datasets` builds the datasets the way the report draws them, and the
keys on the component build the options:

```php
use SugarCommerce\Reports\Datasets;

'sales' => [
	'type'           => 'chart',
	'tab'            => 'overview',
	'title'          => __( 'Net revenue', 'my-plugin' ),
	'height'         => 280,
	'value_format'   => 'currency',             // Money up the side and in the tooltip.
	'currency'       => 'GBP',
	'secondary_axis' => true,                   // A count on the right, for datasets with yAxisID y1.
	'show_period'    => false,                  // No "— Last 30 days" after the title.
	'headline'       => 'my_plugin_sales_headline', // [ 'value' => '£1,204', 'change' => '12% vs previous period', 'direction' => 'up' ]
	'caption'        => 'my_plugin_sales_caption',  // A sentence under the figure.
	'data_callback'  => function ( array $range ): array {
		$series = my_plugin_sales_series( $range );

		return [
			'labels'   => $series['labels'],
			'datasets' => [
				Datasets::line( __( 'Net revenue', 'my-plugin' ), Datasets::so_far( $series['net'], $series['starts'] ), '#3858e9' ),
				Datasets::line( __( 'Orders', 'my-plugin' ), Datasets::so_far( $series['orders'], $series['starts'] ), '#9aa0a6', [ 'yAxisID' => 'y1' ] ),
			],
		];
	},
],
```

Two lines over each other each fade from their own colour. The legend is
drawn for two series and not for one (`show_legend`: `auto`, `true` or
`false`).

* `value_format` is `currency` (with `currency`, formatted by the browser,
  which knows a yen has no pence) or `integer`; anything else is a plain
  number. Chart values are amounts as they are read -- 49.99, not 4999.
  A tile's money is the other way round: minor units (4999), or a decimal
  amount written with its point (`'49.99'`, as `$wpdb` hands back a DECIMAL
  column), read in the currency's own places, so `'99.00'` yen is ¥99.
* `secondary_axis` is `true` for a count, or `[ 'value_format' => ..., 'label' => ... ]`.
* `headline` and `caption` are values or callables handed the range and the
  component. A caption replaces `description` when it has something to say.
* `chart_type` may be `auto`: bars for up to `bars_max` buckets (12), a line
  for more. A first dataset that names its own `type` decides the chart
  instead, which is how `Datasets::over_time()` makes the choice and how
  bars and a line are drawn together.
* `options` is laid over everything the keys built, keyed arrays merged and
  lists replaced, so any Chart.js option is one key away:
  `'options' => [ 'scales' => [ 'y' => [ 'max' => 100 ] ] ]`.

`Datasets`:

| Method | What it returns |
|---|---|
| `line( $label, $data, $colour = '', $extra = [] )` | A monotone line; the script fades the area under it from `$colour`. |
| `bars( $label, $data, $colour = '', $extra = [] )` | Bars, in one colour or a colour per bar. |
| `highlight( $data, $colour, $tint )` | A colour per bar: the tallest in `$colour`, the rest in `$tint`, all `$tint` when every bar is nought. |
| `over_time( $label, $data, [ 'colour', 'bars_max', 'starts', 'now' ] )` | Bars while they can be counted, a line once there are more. |
| `so_far( $data, $starts, $now = null )` | The values with buckets that have not started set to null, so a line stops at today rather than falling to the floor. |

A colour given per bar keeps its colour under the pointer, and a refresh
draws the colours the new data gives: the best bar this time, not last
time's.

## Funnels

How many of those who started something went on to finish it: baskets to
orders, sign-ups to paid.

```php
'basket_to_order' => [
	'type'          => 'funnel',
	'tab'           => 'overview',
	'title'         => __( 'From basket to order', 'my-plugin' ),
	'width'         => 'full',
	'colour'        => '#3858e9', // The bars; the admin colour scheme's otherwise.
	'data_callback' => function ( array $range ): array {
		return [
			'steps'       => [
				[ 'label' => __( 'Baskets', 'my-plugin' ), 'count' => 200 ],
				[ 'label' => __( 'Checkouts', 'my-plugin' ), 'count' => 50, 'next' => __( '%s were paid for', 'my-plugin' ) ],
				[ 'label' => __( 'Orders', 'my-plugin' ), 'count' => 40 ],
			],
			'headline'    => [ 'value' => '20%', 'change' => '3% vs previous period', 'direction' => 'up' ],
			'description' => __( 'Of 200 baskets, 40 were paid for.', 'my-plugin' ),
			'foot'        => [ __( '12 left at checkout', 'my-plugin' ), __( 'Average basket £30', 'my-plugin' ) ],
		];
	},
],
```

Each step is a bar against the first, and under it the share that reached
the next: in its own words with `note`, as a format with `next` ("%s were
paid for"), or "62% continued". The last step says nothing unless it has a
`note`. Without a `headline` the figure is the whole way through, last
step over first. The callback may return just the list of steps.

A funnel whose first step is nought, or that has no steps, draws nothing:
a card of noughts would tell a shop with no baskets it had lost every sale.
It is drawn with the page and not refreshed in place.

## Notes and HTML

An `html` component prints `content` -- markup, or a callable handed the
range and the component -- or whatever its `render_callback` prints.

```php
'when_to_post' => [
	'type'            => 'html',
	'tab'             => 'timing',
	'title'           => '',
	'width'           => 'full',
	'appearance'      => 'note',  // A sentence in a card of its own.
	'markup'          => false,   // Plain text, escaped. Markup goes through wp_kses_post().
	'hide_when_empty' => true,    // Nothing to say, no room taken.
	'content'         => fn( array $range ): string => my_plugin_best_hour_sentence( $range ),
],
```

`hide_when_empty` is off by default, because an empty box is also what a
script fills in later. A component with `ajax_refresh` false is left out of
the in-place refresh.

## Whose days: UTC or the site's

A date range reaches every `data_callback` as `start` and `end` in UTC, for a
column that stores UTC. Where "today" starts is a separate question, and by
default it is midnight UTC. A report whose days should be the site's says so:

```php
Reports::register( 'my-analytics', [
	'timezone'    => 'site',  // 'utc' (default), 'site', or a DateTimeZone
	'week_starts' => null,    // 0 Sunday to 6 Saturday; null is Monday for
	                          // 'utc' and the site's own setting otherwise
] );
```

With `'site'`, Today is the site's midnight to its next midnight -- 23 or 25
hours on the day the clocks change -- two picked dates are the site's days,
and This Week starts on the day set under Settings > General. The page, the
REST refresh and the exports all resolve a period through
`Reports::resolve_range()`, so they agree.

## Layout: tabs or a sidebar

The sections of a report are tabs across the top while there are few of
them, and a list down the left once there are many. Nothing has to be set:
the report counts its tabs.

```php
Reports::register( 'my-analytics', [
	'layout'        => 'auto',   // 'auto', 'tabs' or 'sidebar'
	'sidebar_after' => 6,        // 'auto' is a sidebar above this many tabs

	'tabs'          => [
		'overview' => [ 'label' => __( 'Overview', 'my-plugin' ), 'icon' => 'heroicons-outline:chart-bar' ],
		'export'   => [ 'label' => __( 'Export', 'my-plugin' ), 'position' => 100 ],
		'payouts'  => [
			'label'    => __( 'Payouts', 'my-plugin' ),
			'icon'     => 'dashicons-bank',
			'group'    => __( 'Add-ons', 'my-plugin' ),
			'position' => 60,
		],
	],
] );
```

* `position` orders the tabs in either layout. Tabs that name none sit at
  10, 20, 30 and so on in the order they were written, so there is room
  between any two.
* `group` is a heading in the sidebar. Tabs without one are listed first,
  then each group under its heading. The tab bar has no headings and ignores
  it.
* `icon` is drawn in the sidebar and not on a tab, as in WordPress itself.
  Either form in [Icons](#icons): `heroicons-outline:chart-bar` or
  `dashicons-bank`.

The body carries `reports-layout--tabs` or `reports-layout--sidebar`. Below
782px the sidebar becomes a single row of links above the report that
scrolls sideways, and the tab bar scrolls the same way when its tabs do not
fit, so neither wraps onto a second line.

## Icons

Everywhere a report takes an `icon`, it takes one of two forms:

* `set:name`, from the icon sets of `sugarcommerce/fields` -- `heroicons-outline:key`,
  `heroicons-solid:star`, `wordpress:...` -- drawn as inline SVG in the colour
  of the text around it. The Heroicons names are the ones on heroicons.com.
* A Dashicons name, `admin-network` or `dashicons-admin-network`, drawn as the
  Dashicons span it always was. A report written before there were icon sets
  looks as it did.

Either way the element carries the class `sugarcommerce-icon`, which is what
the stylesheet sizes. A value that is neither -- a typo, an icon no set has --
draws nothing.

```php
'tabs'       => [
	'licenses' => [ 'label' => __( 'Licences', 'my-plugin' ), 'icon' => 'heroicons-outline:key' ],
	'products' => [ 'label' => __( 'Products', 'my-plugin' ), 'icon' => 'dashicons-products' ],
],
'components' => [
	'issued'    => [
		'type'          => 'tile',
		'tab'           => 'licenses',
		'title'         => __( 'Licences issued', 'my-plugin' ),
		'icon'          => 'heroicons-outline:key',
		'icon_color'    => 'blue',
		'data_callback' => 'my_plugin_licences_issued',
	],
	'countries' => [
		'type'          => 'breakdown',
		'tab'           => 'licenses',
		'title'         => __( 'Activations by country', 'my-plugin' ),
		'data_callback' => static fn(): array => [
			'rows' => [
				[ 'label' => 'Japan', 'value' => 12, 'icon' => 'https://example.com/flags/jp.svg' ],
				[ 'label' => 'Elsewhere', 'value' => 3, 'icon' => 'heroicons-outline:globe-alt' ],
			],
		],
	],
],
```

* A tab's `icon` is drawn in the sidebar.
* A tile's `icon` defaults to `heroicons-outline:chart-bar`. The stylesheet
  keeps a tile's icon box hidden -- a tile is a number and its change -- so
  it is there for a stylesheet that shows it.
* A breakdown or stat list row's `icon` is a picture's URL (a flag, a
  thumbnail) or a `set:name` icon, drawn at 16px before the label. A bare
  word there is a relative URL, not a Dashicon.
* The library's own -- the arrow beside a change, the caret on the date
  picker, the calendar under the exports and the empty screen's chart -- are
  Heroicons outline.
* The report's own `icon`, for a top-level menu entry, is passed to
  `add_menu_page()` and so takes what core takes: a Dashicons class
  (default `dashicons-chart-area`), a URL or a base64 SVG.

## Adding to a report from another plugin

Three ways, depending on when your code runs.

Before the report is registered, filter its configuration. The hook is
`sugarcommerce_reports_register` for a plain Composer install; in a copy
prefixed by Strauss it carries the prefix
(`myplugin_sugarcommerce_reports_register`), and `Runtime::hook( 'register' )`
gives the name either way.

```php
add_filter( 'sugarcommerce_reports_register', function ( array $config, string $id ): array {
	if ( 'my-analytics' === $id ) {
		$config['tabs']['payouts']        = [ 'label' => 'Payouts', 'group' => 'Add-ons' ];
		$config['components']['paid_out'] = [
			'type'          => 'tile',
			'tab'           => 'payouts',
			'title'         => 'Paid out',
			'data_callback' => 'my_addon_paid_out',
		];
	}

	return $config;
}, 10, 2 );
```

After it is registered, add to the report itself:

```php
add_action( 'init', function (): void {
	$report = Reports::get( 'my-analytics' );

	if ( $report ) {
		$report
			->add_tab( 'payouts', [ 'label' => 'Payouts', 'position' => 60 ] )
			->add_component( 'paid_out', [ 'type' => 'tile', 'tab' => 'payouts', 'data_callback' => 'my_addon_paid_out' ] )
			->add_export( 'payouts', [ 'tab' => 'payouts', 'data_callback' => 'my_addon_payout_rows', 'total_callback' => 'my_addon_payout_count' ] );
	}
}, 20 );
```

Either way, do it on every request and not only in the admin: the figures
are fetched over REST, and a component added only where the page is drawn is
one the REST request has never heard of.

A component of a type the library does not have is drawn by a filter,
`sugarcommerce_reports_render_component` (prefixed the same way): return true from it once
you have printed the component.

## Moving from arraypress/wp-*

From `arraypress/wp-register-reports` (`ArrayPress\RegisterReports`). Every
configuration key, component type, method on a report and `Datasets` method
keeps its name; what a screen shows is the same. It now builds on
`sugarcommerce/fields`, `sugarcommerce/dates`, `sugarcommerce/money`,
`sugarcommerce/text` and `sugarcommerce/plugin` in place of their
`arraypress/wp-*` predecessors.

| Old | New |
|---|---|
| `ArrayPress\RegisterReports\*` | `SugarCommerce\Reports\*` |
| `register_reports( $id, $config )` | `Reports::register( $id, $config )` |
| `get_reports( $id )` | `Reports::get( $id )` (the id is read as a key, as it is registered) |
| filter `reports_register` (`{prefix}_reports_register`) | `sugarcommerce_reports_register` (`Runtime::hook( 'register' )`) |
| filter `reports_render_component` | `sugarcommerce_reports_render_component` (`Runtime::hook( 'render_component' )`) |
| REST namespace `reports/v1` (`{prefix}-reports/v1`) | `sugarcommerce-reports/v1` (`Runtime::rest_namespace()`) |
| script and style handles `reports`, `reports-chartjs` | `sugarcommerce-reports`, `sugarcommerce-reports-chartjs` (`Runtime::handle()`) |
| `window.ArrayPressReports[handle]`, `window.ReportsAdmin` | `window.SugarCommerceReports[handle]`, `window.SugarcommerceReportsAdmin` |
| transients `reports_export_*`, uploads folder `reports_exports` | `sugarcommerce_reports_export_*`, `sugarcommerce_reports_exports` (`Runtime::key()`) |
| user meta for hidden components, `reports_hidden_components_{id}` | `sugarcommerce_reports_hidden_components_{id}` (`Runtime::key()`) |
| icon class `arraypress-icon` | `sugarcommerce-icon` |
| `format_money()` from wp-money | `SugarCommerce\Money\Money::format()` |
| `Format::minor_units( $value )`: a decimal amount times 100 | `Format::minor_units( $value, $currency )`: times the currency's own places, so `'99.00'` yen is 99 |
| CSV cells defused by the library's own `fputcsv()` wrapper | written by `SugarCommerce\Text\Csv`: the same apostrophe on a formula, numbers left alone, and a cell with a space or a semicolon quoted |
| `arraypress_enqueue_composer_style()` / `_script()` | `SugarCommerce\Plugin\Assets::enqueue_style()` / `enqueue_script()` |
| text domain `arraypress` | `sugarcommerce` |

Every `reports-*` CSS class, body class and data attribute, and the
`date_preset`, `date_start`, `date_end`, `tab` and `filter_*` query
arguments, are unchanged, so a link to a report and a stylesheet aimed at one
keep working. A site that filtered the old hook names, or saved hidden
components under the old key, needs the new one.

## Requirements

* PHP 8.3 or later
* WordPress 7.1 or later

## License

GPL-2.0-or-later
