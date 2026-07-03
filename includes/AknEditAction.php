<?php
/**
 * action=aknedit — mount point for the structured AKN editor.
 *
 * Renders a single empty div; all real work (parsing, outline, form,
 * save) happens client-side in ext.aknEditor.app against the raw XML
 * and baserevid passed through as JS config vars.
 *
 * @file
 * @license GPL-2.0-or-later
 */

namespace MediaWiki\Extension\AknEditor;

use MediaWiki\Actions\FormlessAction;
use MediaWiki\Html\Html;

class AknEditAction extends FormlessAction
{
	public function getName()
	{
		return 'aknedit';
	}

	public function getRestriction()
	{
		return 'edit';
	}

	protected function getPageTitle()
	{
		return $this->msg('aknedit-title', $this->getTitle()->getPrefixedText());
	}

	protected function getDescription()
	{
		return '';
	}

	public function onView()
	{
		$title = $this->getTitle();

		if ($title->getContentModel() !== CONTENT_MODEL_AKN) {
			return Html::element('p', [], $this->msg('aknedit-not-akn')->text());
		}

		if ($title->inNamespace(NS_GAZETTE)) {
			return Html::element('p', [], $this->msg('aknedit-not-supported-gazette')->text());
		}

		$content = $this->getWikiPage()->getContent();
		$xml = $content !== null ? $content->getText() : '';

		$output = $this->getOutput();
		$output->addModules(['ext.aknEditor.app']);
		$output->addJsConfigVars([
			'wgAknEditorXml' => $xml,
			'wgAknEditorTitle' => $title->getPrefixedText(),
			'wgAknEditorBaseRevId' => $this->getWikiPage()->getLatest(),
		]);

		return Html::element('div', ['id' => 'akn-editor-root']);
	}
}
