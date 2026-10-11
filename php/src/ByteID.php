<?php

declare(strict_types=1);

namespace UVerify;

// UVerify is now ByteID: `new \UVerify\ByteID(...)` is the same client under its new name.
// Composer autoloads this file the first time UVerify\ByteID is used.
class_alias(UVerify::class, ByteID::class);
