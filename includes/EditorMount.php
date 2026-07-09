<?php
/**
 * Mounts the client-side AKN editor onto an OutputPage.
 *
 * Two entry points open the same editor: action=aknedit on an existing page
 * (AknEditAction) and the creation wizard (SpecialNewAkn). Both need the exact
 * same wiring — load the module, pass the document XML / target title / base
 * revision as JS config, and emit the mount point (plus the anon warning) — so
 * it lives here once instead of drifting between the two callers.
 *
 * @file
 * @license GPL-2.0-or-later
 */

namespace MediaWiki\Extension\AknEditor;

use MediaWiki\Html\Html;
use MediaWiki\Output\OutputPage;

class EditorMount
{

	/**
	 * Wire the editor onto $output and return the HTML to place in the body.
	 *
	 * @param OutputPage $output
	 * @param string $xml The document to edit (already schema-valid).
	 * @param string $titleText Prefixed text of the page the editor saves to.
	 * @param int $baseRevId The base revision for edit-conflict detection; 0
	 *   when the target page does not yet exist (the wizard's create flow).
	 * @param bool $userIsNamed Whether the editing user is logged in.
	 * @return string
	 */
	public static function addTo(
		OutputPage $output,
		string $xml,
		string $titleText,
		int $baseRevId,
		bool $userIsNamed
	): string {
		$output->addModules(['ext.aknEditor.app']);
		$output->addJsConfigVars([
			'wgAknEditorXml' => $xml,
			'wgAknEditorTitle' => $titleText,
			'wgAknEditorBaseRevId' => $baseRevId,
		]);

		$html = '';
		if (!$userIsNamed) {
			$html .= Html::warningBox($output->msg('aknedit-anon-warning')->parse());
		}
		$html .= Html::element('div', ['id' => 'akn-editor-root']);
		return $html;
	}
}
