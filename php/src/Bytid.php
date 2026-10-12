<?php

declare(strict_types=1);

namespace UVerify;

// UVerify is now Bytid: `new \UVerify\Bytid(...)` is the same client under its new name.
// Composer autoloads this file the first time UVerify\Bytid is used.
class_alias(UVerify::class, Bytid::class);
