<?php

namespace MediaWiki\Extension\AknEditor\Tests\Unit;

use MediaWiki\Extension\AknEditor\HookHandler;
use MediaWiki\Skin\SkinTemplate;
use MediaWiki\Title\Title;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\AknEditor\HookHandler
 */
class HookHandlerTest extends MediaWikiUnitTestCase
{

	protected function setUp(): void
	{
		parent::setUp();
		// Normally defined by AknRenderer's Hooks::onRegistration() at
		// extension-registration time, before any hook fires — that never
		// runs in a unit-test bootstrap, so define it the same way here.
		if (!defined('CONTENT_MODEL_AKN')) {
			define('CONTENT_MODEL_AKN', 'akn-xml');
		}
	}

	private function skinTemplateFor(string $contentModel, bool $hasEditLink): SkinTemplate
	{
		$title = $this->createMock(Title::class);
		$title->method('getContentModel')->willReturn($contentModel);
		$title->method('getLocalURL')->willReturnCallback(
			static fn($query = '') => '/wiki/Test?' . http_build_query((array) $query)
		);

		$sktemplate = $this->createMock(SkinTemplate::class);
		$sktemplate->method('getTitle')->willReturn($title);

		return $sktemplate;
	}

	public function testRewritesEditLinkForAknContent(): void
	{
		$sktemplate = $this->skinTemplateFor(CONTENT_MODEL_AKN, true);
		$links = ['views' => ['edit' => ['href' => '/wiki/Test?action=edit']]];

		(new HookHandler())->onSkinTemplateNavigation__Universal($sktemplate, $links);

		$this->assertStringContainsString('action=aknedit', $links['views']['edit']['href']);
	}

	public function testLeavesNonAknContentAlone(): void
	{
		$sktemplate = $this->skinTemplateFor('wikitext', true);
		$original = ['views' => ['edit' => ['href' => '/wiki/Test?action=edit']]];
		$links = $original;

		(new HookHandler())->onSkinTemplateNavigation__Universal($sktemplate, $links);

		$this->assertSame($original, $links);
	}

	/**
	 * A user without edit rights gets 'viewsource', not 'edit' — must not
	 * be sent to an editor they can't save from.
	 */
	public function testLeavesViewSourceAlone(): void
	{
		$sktemplate = $this->skinTemplateFor(CONTENT_MODEL_AKN, false);
		$links = ['views' => ['viewsource' => ['href' => '/wiki/Test?action=edit']]];
		$before = $links;

		(new HookHandler())->onSkinTemplateNavigation__Universal($sktemplate, $links);

		$this->assertSame($before, $links);
	}
}
