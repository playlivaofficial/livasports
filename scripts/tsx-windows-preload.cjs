// tsx derives a temporary-directory suffix from os.userInfo() on Windows.
// Some constrained Windows hosts can fail that OS lookup even when Node itself
// is healthy. Supplying the Unix-style numeric identity avoids the lookup and
// does not affect application behavior.
if (typeof process.geteuid !== 'function') {
  process.geteuid = () => 0;
}
