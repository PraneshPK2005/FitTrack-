import { useState, useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Returns a bottom-padding value that grows to comfortably clear the
 * on-screen keyboard while it's visible, and shrinks back to a small
 * default the rest of the time.
 *
 * Why this exists: a screen's ScrollView needs enough *scrollable* room
 * below its last field for the user to actually scroll that field above
 * the keyboard — KeyboardAvoidingView/automaticallyAdjustKeyboardInsets
 * can't create scroll room that doesn't exist. A fixed large bottom
 * padding would fix that, but leaves a big empty gap at the bottom of
 * every screen even when the keyboard isn't showing. This hook adds that
 * extra room only while the keyboard is actually up.
 */
export function useKeyboardPadding(basePadding = 40, extra = 40) {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, e => setKbHeight(e?.endCoordinates?.height || 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, []);

  return kbHeight > 0 ? kbHeight + extra : basePadding;
}