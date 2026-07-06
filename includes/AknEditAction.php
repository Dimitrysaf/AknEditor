<?php
/**
 * action=aknedit — mount point for the structured AKN editor.
 *
 * @file
 * @license GPL-2.0-or-later
 */

namespace MediaWiki\Extension\AknEditor;

use MediaWiki\Actions\FormlessAction;
use MediaWiki\Extension\AknRenderer\AknContent;
use MediaWiki\Html\Html;
use MediaWiki\MediaWikiServices;
use MediaWiki\Parser\ParserOptions;

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

		if ($title->exists() && $title->getContentModel() !== CONTENT_MODEL_AKN) {
			return Html::element('p', [], $this->msg('aknedit-not-akn')->text());
		}

		if (!$this->getAuthority()->probablyCan('edit', $title)) {
			return Html::errorBox($this->msg('aknedit-permission-denied')->parse());
		}

		$request = $this->getRequest();
		if ($request->wasPosted() && $request->getCheck('wpAknPreview')) {
			return $this->renderPreview($request->getText('wpAknXml'));
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

		$html = '';
		if (!$this->getUser()->isNamed()) {
			$html .= Html::warningBox($this->msg('aknedit-anon-warning')->parse());
		}
		$html .= Html::element('div', ['id' => 'akn-editor-root']);
		return $html;
	}

	private function renderPreview(string $xml): string
	{
		$output = $this->getOutput();
		$output->setPageTitleMsg($this->msg('aknedit-preview-title', $this->getTitle()->getPrefixedText()));

		$content = new AknContent($xml);
		$contentRenderer = MediaWikiServices::getInstance()->getContentRenderer();
		$parserOutput = $contentRenderer->getParserOutput(
			$content,
			$this->getTitle(),
			null,
			ParserOptions::newFromContext($this->getContext())
		);
		$output->addParserOutput($parserOutput, ParserOptions::newFromContext($this->getContext()));

		return Html::warningBox($this->msg('aknedit-preview-note')->parse());
	}
}
