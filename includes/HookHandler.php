<?php
/**
 * Runtime hook: send the "Edit" tab to action=aknedit instead of the plain
 * textarea editor, for pages using AknRenderer's akn-xml content model.
 *
 * Deliberately a separate hook handler from AknRenderer's own (which only
 * touches the history/revisions tab) rather than a change to AknRenderer
 * itself — hooks support multiple independent handlers for the same event,
 * so this needs no coupling back into AknRenderer's code.
 *
 * @file
 * @license GPL-2.0-or-later
 */

namespace MediaWiki\Extension\AknEditor;

use MediaWiki\Skin\Hook\SkinTemplateNavigation__UniversalHook;

class HookHandler implements SkinTemplateNavigation__UniversalHook
{

	/**
	 * @param \MediaWiki\Skin\SkinTemplate $sktemplate
	 * @param array &$links
	 */
	public function onSkinTemplateNavigation__Universal($sktemplate, &$links): void
	{
		$title = $sktemplate->getTitle();
		if ($title === null || $title->getContentModel() !== CONTENT_MODEL_AKN) {
			return;
		}

		// Only present if core already decided this user can edit the page
		// (the alternative is 'viewsource', for users without edit rights —
		// leave that alone rather than send read-only users to an editor
		// they couldn't save from anyway).
		if (!isset($links['views']['edit'])) {
			return;
		}

		$links['views']['edit']['href'] = $title->getLocalURL(['action' => 'aknedit']);
	}
}
