import React from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';

/**
 * Drop-in replacement for react-native's TextInput that adds a small "X"
 * clear button inside the field once the user has typed something.
 *
 * Why this exists: the project had ~40 raw <TextInput> usages scattered
 * across screens with no shared wrapper, each with its own bespoke style
 * object. Rather than hand-roll an X button (and its positioning/padding)
 * at every call site, this component wraps TextInput once, keeps every
 * existing prop working exactly as before (value, onChangeText, style,
 * placeholder, secureTextEntry, keyboardType, etc. all pass straight
 * through), and layers the clear button on top without altering the
 * input's own visual style.
 *
 * Usage: swap `<TextInput ... />` for `<ClearableTextInput ... />` with the
 * SAME props. Nothing else needs to change at a call site that has no other
 * trailing control (no password-visibility toggle, no dropdown/search
 * icon). For inputs that already have one of those, leave them as plain
 * TextInput — this component is for plain text fields only, matching the
 * project's instruction not to stack a second trailing control onto an
 * input that already has one.
 *
 * - The X only renders once there is text to clear (props.value is
 *   non-empty), exactly per spec.
 * - Tapping X clears the value via the same onChangeText the input already
 *   uses, so it's a normal, controlled update — not a second state system.
 * - The input keeps focus and the keyboard stays open after clearing,
 *   matching "do not dismiss the keyboard unnecessarily".
 * - `containerStyle` is optional, for the rare case a screen needs to
 *   adjust the wrapping View's layout (e.g. flex:1 siblings); it defaults
 *   to nothing so existing layouts are unaffected.
 */
export default function ClearableTextInput({
  value,
  onChangeText,
  style,
  containerStyle,
  clearButtonColor = '#64748b',
  inputRef,
  ...rest
}) {
  const showClear = !!value && String(value).length > 0;
  const ref = React.useRef(null);

  const handleClear = () => {
    onChangeText?.('');
    // Keep the field focused (don't dismiss the keyboard) — matches the
    // "keep the input focused if that is the current natural behavior"
    // requirement. Re-focusing is a no-op if it's already focused.
    (inputRef?.current || ref.current)?.focus?.();
  };

  return (
    <View style={[{ position: 'relative', justifyContent: 'center' }, containerStyle]}>
      <TextInput
        ref={inputRef || ref}
        value={value}
        onChangeText={onChangeText}
        // Reserve a little room on the right so typed text never renders
        // underneath the clear button. Only added once the button is
        // actually visible, so an empty input keeps its original padding.
        style={[style, showClear ? { paddingRight: 32 } : null]}
        {...rest}
      />
      {showClear && (
        <TouchableOpacity
          onPress={handleClear}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ position: 'absolute', right: 8, height: '100%', justifyContent: 'center', alignItems: 'center', width: 24 }}
        >
          <Text style={{ color: clearButtonColor, fontSize: 16, fontWeight: '700', lineHeight: 16 }}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}