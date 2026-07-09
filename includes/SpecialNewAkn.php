<?php
/**
 * Special:NewAkn — the creation wizard.
 *
 * Collects the identity metadata for a new legislative document (type, number,
 * dates, ΦΕΚ, country/language, title), then seeds a schema-valid Akoma Ntoso
 * skeleton (AknRenderer's AknSkeleton — the one place that knows what the XSD
 * requires) and opens the structured editor on it. Nothing is written until the
 * user saves from the editor: the metadata is a starting point, fully editable
 * afterward (the identity fields are seeded, not locked).
 *
 * @file
 * @license GPL-2.0-or-later
 */

namespace MediaWiki\Extension\AknEditor;

use MediaWiki\Extension\AknRenderer\AknSkeleton;
use MediaWiki\Extension\AknRenderer\AknVocabulary;
use MediaWiki\HTMLForm\HTMLForm;
use MediaWiki\SpecialPage\SpecialPage;
use MediaWiki\Status\Status;
use MediaWiki\Title\Title;

class SpecialNewAkn extends SpecialPage
{

	/** The seed built on a successful submit, then handed to the editor. */
	private ?string $seededXml = null;

	/** The page the editor will save the new document to. */
	private ?Title $targetTitle = null;

	public function __construct()
	{
		parent::__construct('NewAkn', 'edit');
	}

	protected function getGroupName()
	{
		return 'pagetools';
	}

	public function execute($par)
	{
		$this->setHeaders();
		$this->outputHeader();
		$this->checkPermissions();

		$out = $this->getOutput();

		$form = HTMLForm::factory('ooui', $this->getFormFields(), $this->getContext());
		$form->setSubmitCallback([$this, 'onFormSubmit']);
		$form->setSubmitTextMsg('aknedit-newakn-submit');
		$form->setWrapperLegendMsg('aknedit-newakn-legend');
		$form->setPreHtml($this->msg('aknedit-newakn-intro')->parseAsBlock());
		$form->prepareForm();

		$result = $form->tryAuthorizedSubmit();
		if (($result === true || ($result instanceof Status && $result->isGood())) && $this->targetTitle !== null) {
			// Submission succeeded: replace the form with the editor, seeded
			// with the freshly built (and schema-valid) document.
			$out->addHTML(EditorMount::addTo(
				$out,
				(string)$this->seededXml,
				$this->targetTitle->getPrefixedText(),
				0,
				$this->getUser()->isNamed()
			));
			return;
		}

		$form->displayForm($result);
	}

	/**
	 * @return array<string,array<string,mixed>>
	 */
	private function getFormFields(): array
	{
		return [
			'type' => [
				'type' => 'select',
				'label-message' => 'aknedit-newakn-field-type',
				'options' => $this->typeOptions(),
				'default' => 'nomos',
			],
			'number' => [
				'type' => 'text',
				'label-message' => 'aknedit-newakn-field-number',
			],
			'enacted' => [
				'type' => 'date',
				'label-message' => 'aknedit-newakn-field-enacted',
				'required' => true,
			],
			'alias' => [
				'type' => 'text',
				'label-message' => 'aknedit-newakn-field-alias',
			],
			'fekseries' => [
				'type' => 'text',
				'label-message' => 'aknedit-newakn-field-fekseries',
				'help-message' => 'aknedit-newakn-field-fekseries-help',
			],
			'feknumber' => [
				'type' => 'text',
				'label-message' => 'aknedit-newakn-field-feknumber',
			],
			'fekdate' => [
				'type' => 'date',
				'label-message' => 'aknedit-newakn-field-fekdate',
			],
			'country' => [
				'type' => 'select',
				'label-message' => 'aknedit-newakn-field-country',
				'options' => $this->codeOptions(AknVocabulary::COUNTRIES),
				'default' => 'gr',
			],
			'language' => [
				'type' => 'select',
				'label-message' => 'aknedit-newakn-field-language',
				'options' => $this->codeOptions(AknVocabulary::LANGUAGES),
				'default' => 'ell',
			],
			'pagetitle' => [
				'type' => 'text',
				'label-message' => 'aknedit-newakn-field-pagetitle',
				'help-message' => 'aknedit-newakn-field-pagetitle-help',
			],
		];
	}

	/**
	 * Called by HTMLForm on a valid submit. Builds the seed and remembers the
	 * target title; returns a fatal Status (shown on the form) on any problem.
	 *
	 * @param array<string,string> $data
	 * @return true|Status
	 */
	public function onFormSubmit(array $data)
	{
		$type = $data['type'];
		$namespace = $type === 'fek' ? NS_GAZETTE : NS_LAW;

		$titleText = trim($data['pagetitle']);
		if ($titleText === '') {
			$titleText = $this->deriveTitle($type, $data);
		}

		$title = Title::makeTitleSafe($namespace, $titleText);
		if ($title === null) {
			return Status::newFatal('aknedit-newakn-badtitle');
		}
		if ($title->exists()) {
			return Status::newFatal(
				'aknedit-newakn-exists',
				$title->getPrefixedText(),
				$title->getLocalURL(['action' => 'aknedit'])
			);
		}

		$this->targetTitle = $title;
		$this->seededXml = AknSkeleton::fromProfile($type, [
			'number' => $data['number'],
			'enacted' => $data['enacted'],
			'alias' => $data['alias'] !== '' ? $data['alias'] : $title->getText(),
			'country' => $data['country'],
			'language' => $data['language'],
			'fekSeries' => $data['fekseries'],
			'fekNumber' => $data['feknumber'],
			'fekDate' => $data['fekdate'],
		]);

		return true;
	}

	/**
	 * The default page title for a new document, e.g. "Νόμος 5300/2026" or
	 * "ΦΕΚ Α΄ 12/2026". Overridable by the user via the pagetitle field.
	 *
	 * @param string $type
	 * @param array<string,string> $data
	 * @return string
	 */
	private function deriveTitle(string $type, array $data): string
	{
		$year = $this->yearOf($data['enacted']);
		$number = trim($data['number']);

		if ($type === 'fek') {
			$series = trim($data['fekseries']);
			$num = trim($data['feknumber']) !== '' ? trim($data['feknumber']) : $number;
			$out = 'ΦΕΚ';
			if ($series !== '') {
				$out .= ' ' . $series . '΄';
			}
			if ($num !== '') {
				$out .= ' ' . $num;
			}
			if ($year !== '') {
				$out .= '/' . $year;
			}
			return $out;
		}

		// typeOptions() is label => value; recover the label for this value.
		$name = array_flip($this->typeOptions())[$type] ?? $this->msg('aknedit-newakn-untitled')->text();

		$out = $name;
		if ($number !== '') {
			$out .= ' ' . $number;
		}
		if ($year !== '') {
			$out .= '/' . $year;
		}
		return $out;
	}

	/** The document types the wizard offers, as HTMLForm options (label => value). */
	private function typeOptions(): array
	{
		$docTypes = AknVocabulary::DOC_TYPES;
		$order = ['nomos', 'pnp', 'nomosplaisio', 'constitution', 'pd', 'ya', 'kya'];
		$options = [];
		foreach ($order as $key) {
			if (isset($docTypes[$key])) {
				$options[$docTypes[$key]] = $key;
			}
		}
		$options[$this->msg('aknedit-newakn-type-fek')->text()] = 'fek';
		return $options;
	}

	/**
	 * Controlled-vocabulary codes as HTMLForm options, labelled "Name (code)".
	 *
	 * @param array<string,string> $map code => label
	 * @return array<string,string> "label (code)" => code
	 */
	private function codeOptions(array $map): array
	{
		$options = [];
		foreach ($map as $code => $label) {
			$options[$label . ' (' . $code . ')'] = $code;
		}
		return $options;
	}

	private function yearOf(string $date): string
	{
		if (preg_match('/^(\d{4})/', trim($date), $m)) {
			return $m[1];
		}
		return date('Y');
	}
}
