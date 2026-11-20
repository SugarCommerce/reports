<?php
/**
 * Layout
 *
 * @package     SugarCommerce\Reports
 * @copyright   Copyright (c) 2026, ArrayPress Limited
 * @license     GPL2+
 * @since       1.2.0
 */

declare( strict_types=1 );

namespace SugarCommerce\Reports\Traits\Reports;

use SugarCommerce\Reports\Format;

/**
 * Where the list of sections goes: across the top, or down the side.
 *
 * A row of tabs is right for a handful of sections and wrong for a dozen:
 * past six or so they stop fitting on one line, and a report is the kind of
 * screen other plugins add sections to. So the layout is decided by counting
 * them. A few are tabs in the header, as core's Privacy screen has them; more
 * than that and they move to a column on the left, which can be as long as it
 * needs to be and can put an add-on's sections under a heading of their own.
 *
 * `layout` forces either. Everything else about the two is CSS, keyed on a
 * class on the body: the same components, the same controls bar, the same
 * links to the same addresses.
 */
trait Layout {

	/**
	 * The layout this report is drawn in.
	 *
	 * The one place that decides it. The body class, the header and the page
	 * all ask here, so they cannot disagree about which one it is.
	 *
	 * @return string `tabs` or `sidebar`.
	 */
	public function get_layout(): string {
		$layout = (string) ( $this->config['layout'] ?? 'auto' );

		if ( 'tabs' === $layout || 'sidebar' === $layout ) {
			return $layout;
		}

		// Anything else is `auto`, including a value nobody has heard of: a
		// misspelt layout is a report that counts its sections, not one that
		// fails to draw.
		$after = (int) ( $this->config['sidebar_after'] ?? 6 );

		return count( $this->tabs ) > $after ? 'sidebar' : 'tabs';
	}

	/**
	 * Whether the sections are drawn down the side.
	 *
	 * Not when there is no navigation to draw: a report that hides its tabs
	 * hides them in either layout.
	 *
	 * @return bool
	 */
	protected function has_sidebar(): bool {
		return 'sidebar' === $this->get_layout()
			&& ! empty( $this->config['show_tabs'] )
			&& ! empty( $this->tabs );
	}

	/**
	 * The sections as the sidebar lists them.
	 *
	 * Those with no `group` first, under no heading, then each group under
	 * its own in the order the groups first appear. Inside a list the order
	 * is the tabs' own, which is their `position`.
	 *
	 * @return array<int, array{heading: string, tabs: array<string, array<string, mixed>>}>
	 */
	protected function sidebar_sections(): array {
		$sections = [ '' => [] ];

		foreach ( $this->tabs as $key => $tab ) {
			$sections[ trim( (string) ( $tab['group'] ?? '' ) ) ][ $key ] = $tab;
		}

		$listed = [];

		foreach ( $sections as $heading => $tabs ) {
			if ( [] !== $tabs ) {
				$listed[] = [
					'heading' => (string) $heading,
					'tabs'    => $tabs,
				];
			}
		}

		return $listed;
	}

	/**
	 * Render the sections as a column of links.
	 *
	 * A labelled nav of links, as the tab bar is, so it is announced as the
	 * same thing in either layout. The current one carries aria-current; the
	 * class beside it is only how it is drawn.
	 *
	 * An icon here, where the tab bar has none. Core draws no icon on a tab,
	 * and does on every entry of a vertical menu, which is what this is.
	 *
	 * On a narrow screen the same links become one scrolling row, in CSS.
	 * There is no second control for a phone to keep in step with this one.
	 *
	 * @param string $current_tab The section being shown.
	 *
	 * @return void
	 */
	protected function render_sidebar( string $current_tab ): void {
		printf(
			'<nav class="reports-sidebar" aria-label="%s"><div class="reports-sidebar-scroll">',
			esc_attr__( 'Report sections', 'sugarcommerce' )
		);

		// One with an icon and the labels are in a second column, so the tabs
		// without one keep the space for it. None, and there is no column.
		$icons = [] !== array_filter( array_column( $this->tabs, 'icon' ) );

		foreach ( $this->sidebar_sections() as $index => $section ) {
			$labelled = '';

			echo '<div class="reports-sidebar-group">';

			if ( '' !== $section['heading'] ) {
				$heading_id = sprintf( 'reports-sidebar-heading-%s-%d', $this->id, $index );
				$labelled   = sprintf( ' aria-labelledby="%s"', esc_attr( $heading_id ) );

				printf(
					'<h2 class="reports-sidebar-heading" id="%s">%s</h2>',
					esc_attr( $heading_id ),
					esc_html( $section['heading'] )
				);
			}

			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built and escaped above.
			echo '<ul class="reports-sidebar-list"' . $labelled . '>';

			foreach ( $section['tabs'] as $key => $tab ) {
				$this->render_sidebar_link( (string) $key, $tab, (string) $key === $current_tab, $icons );
			}

			echo '</ul></div>';
		}

		echo '</div></nav>';
	}

	/**
	 * One section's link in the sidebar.
	 *
	 * @param string               $key     The tab's key.
	 * @param array<string, mixed> $tab     Its configuration.
	 * @param bool                 $current Whether it is the one being shown.
	 * @param bool                 $icons   Whether any section has an icon.
	 *
	 * @return void
	 */
	protected function render_sidebar_link( string $key, array $tab, bool $current, bool $icons = false ): void {
		// Decorative either way: the label beside it says the same thing.
		// `heroicons-outline:key`, or a Dashicons name as it always was.
		$mark = Format::icon( $tab['icon'] ?? '', [ 'class' => 'reports-sidebar-icon' ] );

		if ( '' === $mark && $icons ) {
			$mark = '<span class="reports-sidebar-icon reports-sidebar-icon--none" aria-hidden="true"></span>';
		}

		printf(
			'<li class="reports-sidebar-item"><a href="%s" class="reports-sidebar-link%s" data-tab="%s"%s>%s<span class="reports-sidebar-label">%s</span></a></li>',
			esc_url( $this->get_tab_url( $key ) ),
			$current ? ' reports-sidebar-link--current' : '',
			esc_attr( $key ),
			$current ? ' aria-current="page"' : '',
			$mark, // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built and escaped above.
			esc_html( (string) ( $tab['label'] ?? $key ) )
		);
	}

	/**
	 * The page with its sections down the side.
	 *
	 * Laid out as core lays out a list screen, because that is the screen
	 * it sits beside in a plugin's menu: an ordinary .wrap, the title at
	 * the top left where every other screen has its title, the filters and
	 * date range in a row under it where a list has its filters, and then
	 * the sections and the report side by side with room between them.
	 *
	 * The centred header band the tabs layout uses is the privacy screen's,
	 * and it is there to hold the tabs. With no tabs to hold it was a white
	 * band with a title in the middle of it -- a different page furniture
	 * from the Orders screen one click away.
	 *
	 * @param string $current_tab Current active tab.
	 *
	 * @return void
	 */
	protected function render_sidebar_page( string $current_tab ): void {
		$title = ! empty( $this->config['header_title'] )
				? $this->config['header_title']
				: $this->config['page_title'];

		?>
		<div class="wrap reports-wrap reports-page" data-report-id="<?php echo esc_attr( $this->id ); ?>">

			<?php if ( ( $this->config['show_title'] ?? true ) && '' !== (string) $title ) : ?>
				<h1 class="wp-heading-inline reports-page-title">
					<?php echo esc_html( (string) $title ); ?>
					<?php
					// Which section this is, after the title: "Reports ›
					// Subscriptions". Not on the first section, which is the
					// report's front page and reads better as the bare title.
					$section = $this->section_title( $current_tab );

					if ( '' !== $section ) :
						?>
						<span class="reports-page-title-sep" aria-hidden="true">&rsaquo;</span>
						<span class="reports-page-title-section"><?php echo esc_html( $section ); ?></span>
					<?php endif; ?>
				</h1>
			<?php endif; ?>

			<?php // Where core moves admin notices to: under the title. ?>
			<hr class="wp-header-end">

			<div class="reports-notices">
				<?php settings_errors( $this->id . '_notices' ); ?>
			</div>

			<?php $this->render_controls_bar( $this->filters_for( $current_tab ) ); ?>

			<div class="reports-shell">
				<?php $this->render_sidebar( $current_tab ); ?>

				<div class="reports-main">
					<div class="reports-content">
						<?php $this->render_tab_content( $current_tab ); ?>
					</div>
				</div>
			</div>
		</div>
		<?php
	}

	/**
	 * The current section's name, for the page title.
	 *
	 * Empty on the first section, and on a report with one section or none.
	 *
	 * @param string $current_tab Current active tab.
	 *
	 * @return string
	 */
	protected function section_title( string $current_tab ): string {
		if ( count( $this->tabs ) < 2 || '' === $current_tab || array_key_first( $this->tabs ) === $current_tab ) {
			return '';
		}

		return (string) ( $this->tabs[ $current_tab ]['label'] ?? '' );
	}
}
