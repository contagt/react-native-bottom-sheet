import React, {
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
  memo,
  useEffect,
} from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import invariant from 'invariant';
import Animated, {
  useAnimatedReaction,
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  runOnJS,
  interpolate,
  Extrapolate,
  runOnUI,
  cancelAnimation,
  useWorkletCallback,
  WithSpringConfig,
  WithTimingConfig,
} from 'react-native-reanimated';
import { State } from 'react-native-gesture-handler';
import {
  useScrollable,
  usePropsValidator,
  useReactiveSharedValue,
  useNormalizedSnapPoints,
  useKeyboard,
} from '../../hooks';
import {
  BottomSheetInternalProvider,
  BottomSheetProvider,
} from '../../contexts';
import BottomSheetContainer from '../bottomSheetContainer';
import BottomSheetGestureHandlersProvider from '../bottomSheetGestureHandlersProvider';
import BottomSheetBackdropContainer from '../bottomSheetBackdropContainer';
import BottomSheetHandleContainer from '../bottomSheetHandleContainer';
import BottomSheetBackgroundContainer from '../bottomSheetBackgroundContainer';
import BottomSheetFooterContainer from '../bottomSheetFooterContainer/BottomSheetFooterContainer';
import BottomSheetDraggableView from '../bottomSheetDraggableView';
// import BottomSheetDebugView from '../bottomSheetDebugView';
import {
  ANIMATION_STATE,
  KEYBOARD_STATE,
  KEYBOARD_BEHAVIOR,
  SHEET_STATE,
  SCROLLABLE_STATE,
  KEYBOARD_BLUR_BEHAVIOR,
  KEYBOARD_INPUT_MODE,
  ANIMATION_SOURCE,
  SNAP_POINT_TYPE,
} from '../../constants';
import {
  animate,
  getKeyboardAnimationConfigs,
  normalizeSnapPoint,
  print,
} from '../../utilities';
import {
  DEFAULT_OVER_DRAG_RESISTANCE_FACTOR,
  DEFAULT_ENABLE_CONTENT_PANNING_GESTURE,
  DEFAULT_ENABLE_HANDLE_PANNING_GESTURE,
  DEFAULT_ENABLE_OVER_DRAG,
  DEFAULT_ANIMATE_ON_MOUNT,
  DEFAULT_KEYBOARD_BEHAVIOR,
  DEFAULT_KEYBOARD_BLUR_BEHAVIOR,
  DEFAULT_KEYBOARD_INPUT_MODE,
  INITIAL_CONTAINER_HEIGHT,
  INITIAL_HANDLE_HEIGHT,
  INITIAL_POSITION,
  INITIAL_SNAP_POINT,
  DEFAULT_ENABLE_PAN_DOWN_TO_CLOSE,
  INITIAL_CONTAINER_OFFSET,
  INITIAL_VALUE,
  DEFAULT_DYNAMIC_SIZING,
  DEFAULT_ACCESSIBLE,
  DEFAULT_ACCESSIBILITY_LABEL,
  DEFAULT_ACCESSIBILITY_ROLE,
} from './constants';
import type { BottomSheetMethods, Insets } from '../../types';
import type { BottomSheetProps, AnimateToPositionType } from './types';
import { styles } from './styles';

Animated.addWhitelistedUIProps({
  decelerationRate: true,
});

type BottomSheet = BottomSheetMethods;

const BottomSheetComponent = forwardRef<BottomSheet, BottomSheetProps>(
  function BottomSheet(props, ref) {
    //#region extract props
    const {
      // animations configurations
      animationConfigs: _providedAnimationConfigs,

      // configurations
      index: _providedIndex = 0,
      snapPoints: _providedSnapPoints,
      animateOnMount = DEFAULT_ANIMATE_ON_MOUNT,
      enableContentPanningGesture = DEFAULT_ENABLE_CONTENT_PANNING_GESTURE,
      enableHandlePanningGesture = DEFAULT_ENABLE_HANDLE_PANNING_GESTURE,
      enableOverDrag = DEFAULT_ENABLE_OVER_DRAG,
      enablePanDownToClose = DEFAULT_ENABLE_PAN_DOWN_TO_CLOSE,
      enableDynamicSizing = DEFAULT_DYNAMIC_SIZING,
      overDragResistanceFactor = DEFAULT_OVER_DRAG_RESISTANCE_FACTOR,

      // styles
      style: _providedStyle,
      containerStyle: _providedContainerStyle,
      backgroundStyle: _providedBackgroundStyle,
      handleStyle: _providedHandleStyle,
      handleIndicatorStyle: _providedHandleIndicatorStyle,

      // hooks
      gestureEventsHandlersHook,

      // keyboard
      keyboardBehavior = DEFAULT_KEYBOARD_BEHAVIOR,
      keyboardBlurBehavior = DEFAULT_KEYBOARD_BLUR_BEHAVIOR,
      android_keyboardInputMode = DEFAULT_KEYBOARD_INPUT_MODE,

      // layout
      containerHeight: _providedContainerHeight,
      containerOffset: _providedContainerOffset,
      topInset = 0,
      bottomInset = 0,
      maxDynamicContentSize,

      // animated callback shared values
      animatedPosition: _providedAnimatedPosition,
      animatedIndex: _providedAnimatedIndex,

      // gestures
      simultaneousHandlers: _providedSimultaneousHandlers,
      waitFor: _providedWaitFor,
      activeOffsetX: _providedActiveOffsetX,
      activeOffsetY: _providedActiveOffsetY,
      failOffsetX: _providedFailOffsetX,
      failOffsetY: _providedFailOffsetY,

      // callbacks
      onChange: _providedOnChange,
      onClose: _providedOnClose,
      onAnimate: _providedOnAnimate,

      // private
      $modal = false,
      detached = false,

      // components
      handleComponent,
      backdropComponent,
      backgroundComponent,
      footerComponent,
      children,

      // accessibility
      accessible: _providedAccessible = DEFAULT_ACCESSIBLE,
      accessibilityLabel:
        _providedAccessibilityLabel = DEFAULT_ACCESSIBILITY_LABEL,
      accessibilityRole:
        _providedAccessibilityRole = DEFAULT_ACCESSIBILITY_ROLE,
    } = props;
    //#endregion

    //#region validate props
    usePropsValidator({
      index: _providedIndex,
      snapPoints: _providedSnapPoints,
      enableDynamicSizing,
      topInset,
      bottomInset,
    });
    //#endregion

    //#region layout variables
    /**
     * This variable is consider an internal variable,
     * that will be used conditionally in `animatedContainerHeight`
     */
    const _animatedContainerHeight = useReactiveSharedValue(
      _providedContainerHeight ?? INITIAL_CONTAINER_HEIGHT
    );
    /**
     * This is a conditional variable, where if the `BottomSheet` is used
     * in a modal, then it will subset vertical insets (top+bottom) from
     * provided container height.
     */
    const animatedContainerHeight = useDerivedValue(() => {
      const verticalInset = topInset + bottomInset;
      return $modal
        ? _animatedContainerHeight.value - verticalInset
        : _animatedContainerHeight.value;
    }, [$modal, topInset, bottomInset]);
    const animatedContainerOffset = useReactiveSharedValue(
      _providedContainerOffset ?? INITIAL_CONTAINER_OFFSET
    ) as Animated.SharedValue<Insets>;
    const animatedHandleHeight = useReactiveSharedValue<number>(
      INITIAL_HANDLE_HEIGHT
    );
    const animatedFooterHeight = useSharedValue(0);
    const animatedContentHeight = useSharedValue(INITIAL_CONTAINER_HEIGHT);
    const [animatedSnapPoints, animatedDynamicSnapPointIndex] =
      useNormalizedSnapPoints(
        _providedSnapPoints,
        animatedContainerHeight,
        animatedContentHeight,
        animatedHandleHeight,
        enableDynamicSizing,
        maxDynamicContentSize
      );
    const animatedHighestSnapPoint = useDerivedValue(
      () => animatedSnapPoints.value[animatedSnapPoints.value.length - 1]
    );
    const animatedClosedPosition = useDerivedValue(() => {
      let closedPosition = animatedContainerHeight.value;

      if ($modal || detached) {
        closedPosition = animatedContainerHeight.value + bottomInset;
      }

      return closedPosition;
    }, [$modal, detached, bottomInset]);
    const animatedSheetHeight = useDerivedValue(
      () => animatedContainerHeight.value - animatedHighestSnapPoint.value
    );
    const animatedCurrentIndex = useReactiveSharedValue(
      animateOnMount ? -1 : _providedIndex
    );
    const animatedPosition = useSharedValue(INITIAL_POSITION);
    const animatedNextPosition = useSharedValue(INITIAL_VALUE);
    const animatedNextPositionIndex = useSharedValue(0);

    // conditional
    const isAnimatedOnMount = useSharedValue(false);
    const isContentHeightFixed = useSharedValue(false);
    const isLayoutCalculated = useDerivedValue(() => {
      let isContainerHeightCalculated = false;
      //container height was provided.
      if (
        _providedContainerHeight !== null ||
        _providedContainerHeight !== undefined
      ) {
        isContainerHeightCalculated = true;
      }
      // container height did set.
      if (animatedContainerHeight.value !== INITIAL_CONTAINER_HEIGHT) {
        isContainerHeightCalculated = true;
      }

      let isHandleHeightCalculated = false;
      // handle component is null.
      if (handleComponent === null) {
        animatedHandleHeight.value = 0;
        isHandleHeightCalculated = true;
      }
      // handle height did set.
      if (animatedHandleHeight.value !== INITIAL_HANDLE_HEIGHT) {
        isHandleHeightCalculated = true;
      }

      let isSnapPointsNormalized = false;
      // the first snap point did normalized
      if (animatedSnapPoints.value[0] !== INITIAL_SNAP_POINT) {
        isSnapPointsNormalized = true;
      }

      return (
        isContainerHeightCalculated &&
        isHandleHeightCalculated &&
        isSnapPointsNormalized
      );
    });
    const isInTemporaryPosition = useSharedValue(false);
    const isForcedClosing = useSharedValue(false);

    // gesture
    const animatedContentGestureState = useSharedValue<State>(
      State.UNDETERMINED
    );
    const animatedHandleGestureState = useSharedValue<State>(
      State.UNDETERMINED
    );
    //#endregion

    //#region hooks variables
    // scrollable variables
    const {
      animatedScrollableType,
      animatedScrollableContentOffsetY,
      animatedScrollableOverrideState,
      isScrollableRefreshable,
      setScrollableRef,
      removeScrollableRef,
    } = useScrollable();
    // keyboard
    const {
      state: animatedKeyboardState,
      height: animatedKeyboardHeight,
      animationDuration: keyboardAnimationDuration,
      animationEasing: keyboardAnimationEasing,
      shouldHandleKeyboardEvents,
    } = useKeyboard();
    const animatedKeyboardHeightInContainer = useSharedValue(0);
    //#endregion

    //#region state/dynamic variables
    // states
    const animatedAnimationState = useSharedValue(ANIMATION_STATE.UNDETERMINED);
    const animatedAnimationSource = useSharedValue<ANIMATION_SOURCE>(
      ANIMATION_SOURCE.MOUNT
    );
    const animatedSheetState = useDerivedValue(() => {
      // closed position = position >= container height
      if (animatedPosition.value >= animatedClosedPosition.value)
        return SHEET_STATE.CLOSED;

      // extended position = container height - sheet height
      const extendedPosition =
        animatedContainerHeight.value - animatedSheetHeight.value;
      if (animatedPosition.value === extendedPosition)
        return SHEET_STATE.EXTENDED;

      // extended position with keyboard =
      // container height - (sheet height + keyboard height in root container)
      const keyboardHeightInContainer = animatedKeyboardHeightInContainer.value;
      const extendedPositionWithKeyboard = Math.max(
        0,
        animatedContainerHeight.value -
          (animatedSheetHeight.value + keyboardHeightInContainer)
      );

      // detect if keyboard is open and the sheet is in temporary position
      if (
        keyboardBehavior === KEYBOARD_BEHAVIOR.interactive &&
        isInTemporaryPosition.value &&
        animatedPosition.value === extendedPositionWithKeyboard
      ) {
        return SHEET_STATE.EXTENDED;
      }

      // fill parent = 0
      if (animatedPosition.value === 0) {
        return SHEET_STATE.FILL_PARENT;
      }

      // detect if position is below extended point
      if (animatedPosition.value < extendedPosition) {
        return SHEET_STATE.OVER_EXTENDED;
      }

      return SHEET_STATE.OPENED;
    }, [
      animatedClosedPosition,
      animatedContainerHeight,
      animatedKeyboardHeightInContainer,
      animatedPosition,
      animatedSheetHeight,
      isInTemporaryPosition,
      keyboardBehavior,
    ]);
    const animatedScrollableState = useDerivedValue(() => {
      /**
       * if scrollable override state is set, then we just return its value.
       */
      if (
        animatedScrollableOverrideState.value !== SCROLLABLE_STATE.UNDETERMINED
      ) {
        return animatedScrollableOverrideState.value;
      }
      /**
       * if sheet state is fill parent, then unlock scrolling
       */
      if (animatedSheetState.value === SHEET_STATE.FILL_PARENT) {
        return SCROLLABLE_STATE.UNLOCKED;
      }

      /**
       * if sheet state is extended, then unlock scrolling
       */
      if (animatedSheetState.value === SHEET_STATE.EXTENDED) {
        return SCROLLABLE_STATE.UNLOCKED;
      }

      /**
       * if keyboard is shown and sheet is animating
       * then we do not lock the scrolling to not lose
       * current scrollable scroll position.
       */
      if (
        animatedKeyboardState.value === KEYBOARD_STATE.SHOWN &&
        animatedAnimationState.value === ANIMATION_STATE.RUNNING
      ) {
        return SCROLLABLE_STATE.UNLOCKED;
      }

      return SCROLLABLE_STATE.LOCKED;
    });
    // dynamic
    const animatedContentHeightMax = useDerivedValue(() => {
      const keyboardHeightInContainer = animatedKeyboardHeightInContainer.value;
      const handleHeight = Math.max(0, animatedHandleHeight.value);
      let contentHeight = animatedSheetHeight.value - handleHeight;

      if (
        keyboardBehavior === KEYBOARD_BEHAVIOR.extend &&
        animatedKeyboardState.value === KEYBOARD_STATE.SHOWN
      ) {
        contentHeight = contentHeight - keyboardHeightInContainer;
      } else if (
        keyboardBehavior === KEYBOARD_BEHAVIOR.fillParent &&
        isInTemporaryPosition.value
      ) {
        if (animatedKeyboardState.value === KEYBOARD_STATE.SHOWN) {
          contentHeight =
            animatedContainerHeight.value -
            handleHeight -
            keyboardHeightInContainer;
        } else {
          contentHeight = animatedContainerHeight.value - handleHeight;
        }
      } else if (
        keyboardBehavior === KEYBOARD_BEHAVIOR.interactive &&
        isInTemporaryPosition.value
      ) {
        const contentWithKeyboardHeight =
          contentHeight + keyboardHeightInContainer;

        if (animatedKeyboardState.value === KEYBOARD_STATE.SHOWN) {
          if (
            keyboardHeightInContainer + animatedSheetHeight.value >
            animatedContainerHeight.value
          ) {
            contentHeight =
              animatedContainerHeight.value -
              keyboardHeightInContainer -
              handleHeight;
          }
        } else if (
          contentWithKeyboardHeight + handleHeight >
          animatedContainerHeight.value
        ) {
          contentHeight = animatedContainerHeight.value - handleHeight;
        } else {
          contentHeight = contentWithKeyboardHeight;
        }
      }

      /**
       * before the container is measured, `contentHeight` value will be below zero,
       * which will lead to freeze the scrollable.
       *
       * @link (https://github.com/gorhom/react-native-bottom-sheet/issues/470)
       */
      return Math.max(contentHeight, 0);
    }, [
      animatedContainerHeight,
      animatedHandleHeight,
      animatedKeyboardHeightInContainer,
      animatedKeyboardState,
      animatedSheetHeight,
      isInTemporaryPosition,
      keyboardBehavior,
    ]);
    const animatedIndex = useDerivedValue(() => {
      const adjustedSnapPoints = animatedSnapPoints.value.slice().reverse();
      const adjustedSnapPointsIndexes = animatedSnapPoints.value
        .slice()
        .map((_: any, index: number) => index)
        .reverse();

      /**
       * we add the close state index `-1`
       */
      adjustedSnapPoints.push(animatedContainerHeight.value);
      adjustedSnapPointsIndexes.push(-1);

      const currentIndex = isLayoutCalculated.value
        ? interpolate(
            animatedPosition.value,
            adjustedSnapPoints,
            adjustedSnapPointsIndexes,
            Extrapolate.CLAMP
          )
        : -1;

      /**
       * if the sheet is currently running an animation by the keyboard opening,
       * then we clamp the index on android with resize keyboard mode.
       */
      if (
        android_keyboardInputMode === KEYBOARD_INPUT_MODE.adjustResize &&
        animatedAnimationSource.value === ANIMATION_SOURCE.KEYBOARD &&
        animatedAnimationState.value === ANIMATION_STATE.RUNNING &&
        isInTemporaryPosition.value
      ) {
        return Math.max(animatedCurrentIndex.value, currentIndex);
      }

      /**
       * if the sheet is currently running an animation by snap point change - usually caused
       * by dynamic content height -, then we return the next position index.
       */
      if (
        animatedAnimationSource.value === ANIMATION_SOURCE.SNAP_POINT_CHANGE &&
        animatedAnimationState.value === ANIMATION_STATE.RUNNING
      ) {
        return animatedNextPositionIndex.value;
      }

      return currentIndex;
    }, [android_keyboardInputMode]);
    //#endregion

    //#region private methods
    /**
     * Calculate the next position based on keyboard state.
     */
    const getNextPosition = useWorkletCallback(
      function getNextPosition() {
        'worklet';
        const currentIndex = animatedCurrentIndex.value;
        const snapPoints = animatedSnapPoints.value;
        const keyboardState = animatedKeyboardState.value;
        const highestSnapPoint = animatedHighestSnapPoint.value;

        /**
         * Handle restore sheet position on blur
         */
        if (
          keyboardBlurBehavior === KEYBOARD_BLUR_BEHAVIOR.restore &&
          keyboardState === KEYBOARD_STATE.HIDDEN &&
          animatedContentGestureState.value !== State.ACTIVE &&
          animatedHandleGestureState.value !== State.ACTIVE
        ) {
          isInTemporaryPosition.value = false;
          const nextPosition = snapPoints[currentIndex];
          return nextPosition;
        }

        /**
         * Handle extend behavior
         */
        if (
          keyboardBehavior === KEYBOARD_BEHAVIOR.extend &&
          keyboardState === KEYBOARD_STATE.SHOWN
        ) {
          return highestSnapPoint;
        }

        /**
         * Handle full screen behavior
         */
        if (
          keyboardBehavior === KEYBOARD_BEHAVIOR.fillParent &&
          keyboardState === KEYBOARD_STATE.SHOWN
        ) {
          isInTemporaryPosition.value = true;
          return 0;
        }

        /**
         * handle interactive behavior
         */
        if (
          keyboardBehavior === KEYBOARD_BEHAVIOR.interactive &&
          keyboardState === KEYBOARD_STATE.SHOWN
        ) {
          isInTemporaryPosition.value = true;
          const keyboardHeightInContainer =
            animatedKeyboardHeightInContainer.value;
          return Math.max(0, highestSnapPoint - keyboardHeightInContainer);
        }

        if (isInTemporaryPosition.value) {
          return animatedPosition.value;
        }

        if (!isAnimatedOnMount.value) {
          return snapPoints[_providedIndex];
        }

        return snapPoints[currentIndex];
      },
      [
        animatedContentGestureState,
        animatedCurrentIndex,
        animatedHandleGestureState,
        animatedHighestSnapPoint,
        animatedKeyboardHeightInContainer,
        animatedKeyboardState,
        animatedPosition,
        animatedSnapPoints,
        isInTemporaryPosition,
        isAnimatedOnMount,
        keyboardBehavior,
        keyboardBlurBehavior,
        _providedIndex,
      ]
    );
    const handleOnChange = useCallback(
      function handleOnChange(index: number, position: number) {
        print({
          component: BottomSheet.name,
          method: handleOnChange.name,
          params: {
            index,
            animatedCurrentIndex: animatedCurrentIndex.value,
          },
        });

        if (_providedOnChange) {
          _providedOnChange(
            index,
            position,
            index === animatedDynamicSnapPointIndex.value
              ? SNAP_POINT_TYPE.DYNAMIC
              : SNAP_POINT_TYPE.PROVIDED
          );
        }


        AccessibilityInfo.isScreenReaderEnabled().then(isEnabled => {
          if (
            !isEnabled ||
            !_providedEnableAccessibilityChangeAnnouncement ||
            !_providedAccessibilityPositionChangeAnnouncement
          ) {
            return;
          }

          const positionInScreen = Math.max(
            Math.floor(
              ((WINDOW_HEIGHT - animatedSnapPoints.value[index] || 1) /
                WINDOW_HEIGHT) *
              100
            ),
            0
          ).toFixed(0);

          AccessibilityInfo.announceForAccessibility(
            typeof _providedAccessibilityPositionChangeAnnouncement ===
              'function'
              ? _providedAccessibilityPositionChangeAnnouncement(
                positionInScreen
              )
              : _providedAccessibilityPositionChangeAnnouncement
          );
        });
      },
      [_providedOnChange, animatedCurrentIndex, animatedDynamicSnapPointIndex]
    );
    const handleOnAnimate = useCallback(
      function handleOnAnimate(toPoint: number) {
        const snapPoints = animatedSnapPoints.value;
        const toIndex = snapPoints.indexOf(toPoint);

        print({
          component: BottomSheet.name,
          method: handleOnAnimate.name,
          params: {
            toIndex,
            fromIndex: animatedCurrentIndex.value,
          },
        });

        if (!_providedOnAnimate) {
          return;
        }

        if (toIndex !== animatedCurrentIndex.value) {
          _providedOnAnimate(animatedCurrentIndex.value, toIndex);
        }
      },
      [_providedOnAnimate, animatedSnapPoints, animatedCurrentIndex]
    );
    //#endregion

    //#region animation
    const stopAnimation = useWorkletCallback(() => {
      cancelAnimation(animatedPosition);
      isForcedClosing.value = false;
      animatedAnimationSource.value = ANIMATION_SOURCE.NONE;
      animatedAnimationState.value = ANIMATION_STATE.STOPPED;
    }, [animatedPosition, animatedAnimationState, animatedAnimationSource]);
    const animateToPositionCompleted = useWorkletCallback(
      function animateToPositionCompleted(isFinished?: boolean) {
        isForcedClosing.value = false;

        if (!isFinished) {
          return;
        }
        runOnJS(print)({
          component: BottomSheet.name,
          method: animateToPositionCompleted.name,
          params: {
            animatedCurrentIndex: animatedCurrentIndex.value,
            animatedNextPosition: animatedNextPosition.value,
            animatedNextPositionIndex: animatedNextPositionIndex.value,
          },
        });

        animatedAnimationSource.value = ANIMATION_SOURCE.NONE;
        animatedAnimationState.value = ANIMATION_STATE.STOPPED;
        animatedNextPosition.value = INITIAL_VALUE;
        animatedNextPositionIndex.value = INITIAL_VALUE;
      }
    );
    const animateToPosition: AnimateToPositionType = useWorkletCallback(
      function animateToPosition(
        position: number,
        source: ANIMATION_SOURCE,
        velocity: number = 0,
        configs?: WithTimingConfig | WithSpringConfig
      ) {
        if (
          position === animatedPosition.value ||
          position === undefined ||
          (animatedAnimationState.value === ANIMATION_STATE.RUNNING &&
            position === animatedNextPosition.value)
        ) {
          return;
        }

        runOnJS(print)({
          component: BottomSheet.name,
          method: animateToPosition.name,
          params: {
            currentPosition: animatedPosition.value,
            nextPosition: position,
            velocity,
            source,
          },
        });

        stopAnimation();

        /**
         * set animation state to running, and source
         */
        animatedAnimationState.value = ANIMATION_STATE.RUNNING;
        animatedAnimationSource.value = source;

        /**
         * store next position
         */
        animatedNextPosition.value = position;
        animatedNextPositionIndex.value =
          animatedSnapPoints.value.indexOf(position);

        /**
         * fire `onAnimate` callback
         */
        runOnJS(handleOnAnimate)(position);

        /**
         * force animation configs from parameters, if provided
         */
        if (configs !== undefined) {
          animatedPosition.value = animate({
            point: position,
            configs,
            velocity,
            onComplete: animateToPositionCompleted,
          });
        } else {
          /**
           * use animationConfigs callback, if provided
           */
          animatedPosition.value = animate({
            point: position,
            velocity,
            configs: _providedAnimationConfigs,
            onComplete: animateToPositionCompleted,
          });
        }
      },
      [handleOnAnimate, _providedAnimationConfigs]
    );
    /**
     * Set to position without animation.
     *
     * @param targetPosition position to be set.
     */
    const setToPosition = useWorkletCallback(function setToPosition(
      targetPosition: number
    ) {
      if (
        targetPosition === animatedPosition.value ||
        targetPosition === undefined ||
        (animatedAnimationState.value === ANIMATION_STATE.RUNNING &&
          targetPosition === animatedNextPosition.value)
      ) {
        return;
      }

      runOnJS(print)({
        component: BottomSheet.name,
        method: setToPosition.name,
        params: {
          currentPosition: animatedPosition.value,
          targetPosition,
        },
      });

      /**
       * store next position
       */
      animatedNextPosition.value = targetPosition;
      animatedNextPositionIndex.value =
        animatedSnapPoints.value.indexOf(targetPosition);

      stopAnimation();

      /**
       * set position.
       */
      animatedPosition.value = targetPosition;
    },
    []);
    //#endregion

    //#region public methods
    const handleSnapToIndex = useCallback(
      function handleSnapToIndex(
        index: number,
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        const snapPoints = animatedSnapPoints.value;
        invariant(
          index >= -1 && index <= snapPoints.length - 1,
          `'index' was provided but out of the provided snap points range! expected value to be between -1, ${
            snapPoints.length - 1
          }`
        );
        print({
          component: BottomSheet.name,
          method: handleSnapToIndex.name,
          params: {
            index,
          },
        });

        const nextPosition = snapPoints[index];

        /**
         * exit method if :
         * - layout is not calculated.
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          !isLayoutCalculated.value ||
          index === animatedNextPositionIndex.value ||
          nextPosition === animatedNextPosition.value ||
          isForcedClosing.value
        ) {
          return;
        }

        /**
         * reset temporary position boolean.
         */
        isInTemporaryPosition.value = false;

        runOnUI(animateToPosition)(
          nextPosition,
          ANIMATION_SOURCE.USER,
          0,
          animationConfigs
        );
      },
      [
        animateToPosition,
        isLayoutCalculated,
        isInTemporaryPosition,
        isForcedClosing,
        animatedSnapPoints,
        animatedNextPosition,
        animatedNextPositionIndex,
      ]
    );
    const handleSnapToPosition = useWorkletCallback(
      function handleSnapToPosition(
        position: number | string,
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        print({
          component: BottomSheet.name,
          method: handleSnapToPosition.name,
          params: {
            position,
          },
        });

        /**
         * normalized provided position.
         */
        const nextPosition = normalizeSnapPoint(
          position,
          animatedContainerHeight.value
        );

        /**
         * exit method if :
         * - layout is not calculated.
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          !isLayoutCalculated ||
          nextPosition === animatedNextPosition.value ||
          isForcedClosing.value
        ) {
          return;
        }

        /**
         * mark the new position as temporary.
         */
        isInTemporaryPosition.value = true;

        runOnUI(animateToPosition)(
          nextPosition,
          ANIMATION_SOURCE.USER,
          0,
          animationConfigs
        );
      },
      [
        animateToPosition,
        bottomInset,
        topInset,
        isLayoutCalculated,
        isForcedClosing,
        animatedContainerHeight,
        animatedPosition,
      ]
    );
    const handleClose = useCallback(
      function handleClose(
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        print({
          component: BottomSheet.name,
          method: handleClose.name,
        });

        const nextPosition = animatedClosedPosition.value;

        /**
         * exit method if :
         * - layout is not calculated.
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          !isLayoutCalculated.value ||
          nextPosition === animatedNextPosition.value ||
          isForcedClosing.value
        ) {
          return;
        }

        /**
         * reset temporary position variable.
         */
        isInTemporaryPosition.value = false;

        runOnUI(animateToPosition)(
          nextPosition,
          ANIMATION_SOURCE.USER,
          0,
          animationConfigs
        );
      },
      [
        animateToPosition,
        isForcedClosing,
        isLayoutCalculated,
        isInTemporaryPosition,
        animatedNextPosition,
        animatedClosedPosition,
      ]
    );
    const handleForceClose = useCallback(
      function handleForceClose(
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        print({
          component: BottomSheet.name,
          method: handleForceClose.name,
        });

        const nextPosition = animatedClosedPosition.value;

        /**
         * exit method if :
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          nextPosition === animatedNextPosition.value ||
          isForcedClosing.value
        ) {
          return;
        }

        /**
         * reset temporary position variable.
         */
        isInTemporaryPosition.value = false;

        /**
         * set force closing variable.
         */
        isForcedClosing.value = true;

        runOnUI(animateToPosition)(
          nextPosition,
          ANIMATION_SOURCE.USER,
          0,
          animationConfigs
        );
      },
      [
        animateToPosition,
        isForcedClosing,
        isInTemporaryPosition,
        animatedNextPosition,
        animatedClosedPosition,
      ]
    );
    const handleExpand = useCallback(
      function handleExpand(
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        print({
          component: BottomSheet.name,
          method: handleExpand.name,
        });

        const snapPoints = animatedSnapPoints.value;
        const nextPosition = snapPoints[snapPoints.length - 1];

        /**
         * exit method if :
         * - layout is not calculated.
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          !isLayoutCalculated.value ||
          snapPoints.length - 1 === animatedNextPositionIndex.value ||
          nextPosition === animatedNextPosition.value ||
          isForcedClosing.value
        ) {
          return;
        }

        /**
         * reset temporary position boolean.
         */
        isInTemporaryPosition.value = false;

        runOnUI(animateToPosition)(
          nextPosition,
          ANIMATION_SOURCE.USER,
          0,
          animationConfigs
        );
      },
      [
        animateToPosition,
        isInTemporaryPosition,
        isLayoutCalculated,
        isForcedClosing,
        animatedSnapPoints,
        animatedNextPosition,
        animatedNextPositionIndex,
      ]
    );
    const handleCollapse = useCallback(
      function handleCollapse(
        animationConfigs?: WithSpringConfig | WithTimingConfig
      ) {
        print({
          component: BottomSheet.name,
          method: handleCollapse.name,
        });

        const nextPosition = animatedSnapPoints.value[0];

        /**
         * exit method if :
         * - layout is not calculated.
         * - already animating to next position.
         * - sheet is forced closing.
         */
        if (
          !isLayoutCalculated ||
          animatedNextPositionIndex.value === 0 ||
          nextPosition === animatedNextPosition.value ||
          isForcedClosing.value
        ) {
          return;
        }

        /**
         * reset temporary position boolean.
         */
        isInTemporaryPosition.value = false;

        runOnUI(animateToPosition)(
          nextPosition,
          ANIMATION_SOURCE.USER,
          0,
          animationConfigs
        );
      },
      [
        animateToPosition,
        isForcedClosing,
        isLayoutCalculated,
        isInTemporaryPosition,
        animatedSnapPoints,
        animatedNextPosition,
        animatedNextPositionIndex,
      ]
    );

    useImperativeHandle(ref, () => ({
      snapToIndex: handleSnapToIndex,
      snapToPosition: handleSnapToPosition,
      expand: handleExpand,
      collapse: handleCollapse,
      close: handleClose,
      forceClose: handleForceClose,
    }));
    //#endregion

    //#region contexts variables
    const internalContextVariables = useMemo(
      () => ({
        enableContentPanningGesture,
        enableDynamicSizing,
        overDragResistanceFactor,
        enableOverDrag,
        enablePanDownToClose,
        animatedAnimationState,
        animatedSheetState,
        animatedScrollableState,
        animatedScrollableOverrideState,
        animatedContentGestureState,
        animatedHandleGestureState,
        animatedKeyboardState,
        animatedScrollableType,
        animatedIndex,
        animatedPosition,
        animatedContentHeight,
        animatedClosedPosition,
        animatedHandleHeight,
        animatedFooterHeight,
        animatedKeyboardHeight,
        animatedKeyboardHeightInContainer,
        animatedContainerHeight,
        animatedSnapPoints,
        animatedHighestSnapPoint,
        animatedScrollableContentOffsetY,
        isInTemporaryPosition,
        isContentHeightFixed,
        isScrollableRefreshable,
        shouldHandleKeyboardEvents,
        simultaneousHandlers: _providedSimultaneousHandlers,
        waitFor: _providedWaitFor,
        activeOffsetX: _providedActiveOffsetX,
        activeOffsetY: _providedActiveOffsetY,
        failOffsetX: _providedFailOffsetX,
        failOffsetY: _providedFailOffsetY,
        animateToPosition,
        stopAnimation,
        setScrollableRef,
        removeScrollableRef,
      }),
      [
        animatedIndex,
        animatedPosition,
        animatedContentHeight,
        animatedScrollableType,
        animatedContentGestureState,
        animatedHandleGestureState,
        animatedClosedPosition,
        animatedFooterHeight,
        animatedContainerHeight,
        animatedHandleHeight,
        animatedAnimationState,
        animatedKeyboardState,
        animatedKeyboardHeight,
        animatedKeyboardHeightInContainer,
        animatedSheetState,
        animatedHighestSnapPoint,
        animatedScrollableState,
        animatedScrollableOverrideState,
        animatedSnapPoints,
        shouldHandleKeyboardEvents,
        animatedScrollableContentOffsetY,
        isScrollableRefreshable,
        isContentHeightFixed,
        isInTemporaryPosition,
        enableContentPanningGesture,
        overDragResistanceFactor,
        enableOverDrag,
        enablePanDownToClose,
        enableDynamicSizing,
        _providedSimultaneousHandlers,
        _providedWaitFor,
        _providedActiveOffsetX,
        _providedActiveOffsetY,
        _providedFailOffsetX,
        _providedFailOffsetY,
        setScrollableRef,
        removeScrollableRef,
        animateToPosition,
        stopAnimation,
      ]
    );
    const externalContextVariables = useMemo(
      () => ({
        animatedIndex,
        animatedPosition,
        snapToIndex: handleSnapToIndex,
        snapToPosition: handleSnapToPosition,
        expand: handleExpand,
        collapse: handleCollapse,
        close: handleClose,
        forceClose: handleForceClose,
      }),
      [
        animatedIndex,
        animatedPosition,
        handleSnapToIndex,
        handleSnapToPosition,
        handleExpand,
        handleCollapse,
        handleClose,
        handleForceClose,
      ]
    );
    //#endregion

    //#region styles
    const containerAnimatedStyle = useAnimatedStyle(
      () => ({
        opacity:
          Platform.OS === 'android' && animatedIndex.value === -1 ? 0 : 1,
        transform: [
          {
            translateY: animatedPosition.value,
          },
        ],
      }),
      [animatedPosition, animatedIndex]
    );
    const containerStyle = useMemo(
      () => [_providedStyle, styles.container, containerAnimatedStyle],
      [_providedStyle, containerAnimatedStyle]
    );
    const contentContainerAnimatedStyle = useAnimatedStyle(() => {
      /**
       * if dynamic sizing is enabled, and content height
       * is still not set, then we exit method.
       */
      if (
        enableDynamicSizing &&
        animatedContentHeight.value === INITIAL_CONTAINER_HEIGHT
      ) {
        return {};
      }

      return {
        height: animate({
          point: animatedContentHeightMax.value,
          configs: _providedAnimationConfigs,
        }),
      };
    }, [animatedContentHeightMax, enableDynamicSizing, animatedContentHeight]);
    const contentContainerStyle = useMemo(
      () => [styles.contentContainer, contentContainerAnimatedStyle],
      [contentContainerAnimatedStyle]
    );
    /**
     * added safe area to prevent the sheet from floating above
     * the bottom of the screen, when sheet being over dragged or
     * when the sheet is resized.
     */
    const contentMaskContainerAnimatedStyle = useAnimatedStyle(() => {
      if (detached) {
        return {
          overflow: 'visible',
        };
      }
      return {
        paddingBottom: animatedContainerHeight.value,
      };
    }, [detached]);
    const contentMaskContainerStyle = useMemo(
      () => [styles.contentMaskContainer, contentMaskContainerAnimatedStyle],
      [contentMaskContainerAnimatedStyle]
    );
    //#endregion

    //#region effects
    /**
     * React to `isLayoutCalculated` change, to insure that the sheet will
     * appears/mounts only when all layout is been calculated.
     *
     * @alias OnMount
     */
    useAnimatedReaction(
      () => isLayoutCalculated.value,
      _isLayoutCalculated => {
        /**
         * exit method if:
         * - layout is not calculated yet.
         * - already did animate on mount.
         */
        if (!_isLayoutCalculated || isAnimatedOnMount.value) {
          return;
        }

        let nextPosition;
        if (_providedIndex === -1) {
          nextPosition = animatedClosedPosition.value;
          animatedNextPositionIndex.value = -1;
        } else {
          nextPosition = getNextPosition();
        }

        runOnJS(print)({
          component: BottomSheet.name,
          method: 'useAnimatedReaction::OnMount',
          params: {
            isLayoutCalculated: _isLayoutCalculated,
            animatedSnapPoints: animatedSnapPoints.value,
            nextPosition,
          },
        });

        /**
         * here we exit method early because the next position
         * is out of the screen, this happens when `snapPoints`
         * still being calculated.
         */
        if (
          nextPosition === INITIAL_POSITION ||
          nextPosition === animatedClosedPosition.value
        ) {
          isAnimatedOnMount.value = true;
          animatedCurrentIndex.value = _providedIndex;
          return;
        }

        if (animateOnMount) {
          animateToPosition(nextPosition, ANIMATION_SOURCE.MOUNT);
        } else {
          animatedPosition.value = nextPosition;
        }
        isAnimatedOnMount.value = true;
      },
      [_providedIndex, animateOnMount]
    );

    /**
     * React to `snapPoints` change, to insure that the sheet position reflect
     * to the current point correctly.
     *
     * @alias OnSnapPointsChange
     */
    useAnimatedReaction(
      () => ({
        snapPoints: animatedSnapPoints.value,
        containerHeight: animatedContainerHeight.value,
      }),
      (result, _previousResult) => {
        const { snapPoints, containerHeight } = result;
        const _previousSnapPoints = _previousResult?.snapPoints;
        const _previousContainerHeight = _previousResult?.containerHeight;

        let nextPosition;
        let animationConfig;
        let animationSource = ANIMATION_SOURCE.SNAP_POINT_CHANGE;

        /**
         * if the bottom sheet is closing and the container gets resized,
         * then we restart the closing animation to the new position.
         */
        if (
          animatedAnimationState.value === ANIMATION_STATE.RUNNING &&
          animatedNextPositionIndex.value === -1 &&
          _previousContainerHeight !== containerHeight
        ) {
          setToPosition(containerHeight);
          return;
        }

        if (
          JSON.stringify(snapPoints) === JSON.stringify(_previousSnapPoints) ||
          !isLayoutCalculated.value ||
          !isAnimatedOnMount.value ||
          containerHeight <= 0
        ) {
          return;
        }

        runOnJS(print)({
          component: BottomSheet.name,
          method: 'useAnimatedReaction::OnSnapPointChange',
          params: {
            snapPoints,
          },
        });

        /**
         * if snap points changed while sheet is animating, then
         * we stop the animation and animate to the updated point.
         */
        if (
          animatedAnimationState.value === ANIMATION_STATE.RUNNING &&
          animatedNextPositionIndex.value !== animatedCurrentIndex.value
        ) {
          nextPosition =
            animatedNextPositionIndex.value !== -1
              ? snapPoints[animatedNextPositionIndex.value]
              : animatedNextPosition.value;
        } else if (animatedCurrentIndex.value === -1) {
          nextPosition = animatedClosedPosition.value;
        } else if (isInTemporaryPosition.value) {
          nextPosition = getNextPosition();
        } else {
          nextPosition = snapPoints[animatedCurrentIndex.value];

          /**
           * if snap points changes because of the container height change,
           * then we set the new position without animation.
           */
          if (containerHeight !== _previousContainerHeight) {
            setToPosition(nextPosition);
            return;
          }
        }
        animateToPosition(nextPosition, animationSource, 0, animationConfig);
      }
    );

    /**
     * React to keyboard appearance state.
     *
     * @alias OnKeyboardStateChange
     */
    useAnimatedReaction(
      () => ({
        _keyboardState: animatedKeyboardState.value,
        _keyboardHeight: animatedKeyboardHeight.value,
      }),
      (result, _previousResult) => {
        const { _keyboardState, _keyboardHeight } = result;
        const _previousKeyboardState = _previousResult?._keyboardState;
        const _previousKeyboardHeight = _previousResult?._keyboardHeight;

        /**
         * Calculate the keyboard height in the container.
         */
        animatedKeyboardHeightInContainer.value =
          _keyboardHeight === 0
            ? 0
            : $modal
            ? Math.abs(
                _keyboardHeight -
                  Math.abs(bottomInset - animatedContainerOffset.value.bottom)
              )
            : Math.abs(_keyboardHeight - animatedContainerOffset.value.bottom);

        /**
         * if keyboard state is equal to the previous state, then exit the method
         */
        if (
          _keyboardState === _previousKeyboardState &&
          _keyboardHeight === _previousKeyboardHeight
        ) {
          return;
        }

        /**
         * if user is interacting with sheet, then exit the method
         */
        const hasActiveGesture =
          animatedContentGestureState.value === State.ACTIVE ||
          animatedContentGestureState.value === State.BEGAN ||
          animatedHandleGestureState.value === State.ACTIVE ||
          animatedHandleGestureState.value === State.BEGAN;
        if (hasActiveGesture) {
          return;
        }

        /**
         * if sheet not animated on mount yet, then exit the method
         */
        if (!isAnimatedOnMount.value) {
          return;
        }

        /**
         * if new keyboard state is hidden and blur behavior is none, then exit the method
         */
        if (
          _keyboardState === KEYBOARD_STATE.HIDDEN &&
          keyboardBlurBehavior === KEYBOARD_BLUR_BEHAVIOR.none
        ) {
          return;
        }

        /**
         * if platform is android and the input mode is resize, then exit the method
         */
        if (
          Platform.OS === 'android' &&
          keyboardBehavior === KEYBOARD_BEHAVIOR.interactive &&
          android_keyboardInputMode === KEYBOARD_INPUT_MODE.adjustResize
        ) {
          animatedKeyboardHeightInContainer.value = 0;
          return;
        }

        runOnJS(print)({
          component: BottomSheet.name,
          method: 'useAnimatedReaction::OnKeyboardStateChange',
          params: {
            keyboardState: _keyboardState,
            keyboardHeight: _keyboardHeight,
          },
        });

        let animationConfigs = getKeyboardAnimationConfigs(
          keyboardAnimationEasing.value,
          keyboardAnimationDuration.value
        );
        const nextPosition = getNextPosition();
        animateToPosition(
          nextPosition,
          ANIMATION_SOURCE.KEYBOARD,
          0,
          animationConfigs
        );
      },
      [
        $modal,
        bottomInset,
        keyboardBehavior,
        keyboardBlurBehavior,
        android_keyboardInputMode,
        animatedContainerOffset,
        getNextPosition,
      ]
    );

    /**
     * sets provided animated position
     */
    useAnimatedReaction(
      () => animatedPosition.value,
      _animatedPosition => {
        if (_providedAnimatedPosition) {
          _providedAnimatedPosition.value = _animatedPosition + topInset;
        }
      }
    );

    /**
     * sets provided animated index
     */
    useAnimatedReaction(
      () => animatedIndex.value,
      _animatedIndex => {
        if (_providedAnimatedIndex) {
          _providedAnimatedIndex.value = _animatedIndex;
        }
      }
    );

    /**
     * React to internal variables to detect change in snap position.
     *
     * @alias OnChange
     */
    useAnimatedReaction(
      () => ({
        _animatedIndex: animatedIndex.value,
        _animatedPosition: animatedPosition.value,
        _animationState: animatedAnimationState.value,
        _contentGestureState: animatedContentGestureState.value,
        _handleGestureState: animatedHandleGestureState.value,
      }),
      ({
        _animatedIndex,
        _animatedPosition,
        _animationState,
        _contentGestureState,
        _handleGestureState,
      }) => {
        /**
         * exit the method if animation state is not stopped.
         */
        if (_animationState !== ANIMATION_STATE.STOPPED) {
          return;
        }

        /**
         * exit the method if index value is not synced with
         * position value.
         *
         * [read more](https://github.com/gorhom/react-native-bottom-sheet/issues/1356)
         */
        if (
          animatedNextPosition.value !== INITIAL_VALUE &&
          animatedNextPositionIndex.value !== INITIAL_VALUE &&
          (_animatedPosition !== animatedNextPosition.value ||
            _animatedIndex !== animatedNextPositionIndex.value)
        ) {
          return;
        }

        /**
         * exit the method if animated index value
         * has fraction, e.g. 1.99, 0.52
         */
        if (_animatedIndex % 1 !== 0) {
          return;
        }

        /**
         * exit the method if there any active gesture.
         */
        const hasNoActiveGesture =
          (_contentGestureState === State.END ||
            _contentGestureState === State.UNDETERMINED ||
            _contentGestureState === State.CANCELLED) &&
          (_handleGestureState === State.END ||
            _handleGestureState === State.UNDETERMINED ||
            _handleGestureState === State.CANCELLED);
        if (!hasNoActiveGesture) {
          return;
        }

        /**
         * if the index is not equal to the current index,
         * than the sheet position had changed and we trigger
         * the `onChange` callback.
         */
        if (_animatedIndex !== animatedCurrentIndex.value) {
          runOnJS(print)({
            component: BottomSheet.name,
            method: 'useAnimatedReaction::OnChange',
            params: {
              animatedCurrentIndex: animatedCurrentIndex.value,
              animatedIndex: _animatedIndex,
            },
          });

          animatedCurrentIndex.value = _animatedIndex;
          runOnJS(handleOnChange)(_animatedIndex, _animatedPosition);
        }

        /**
         * if index is `-1` than we fire the `onClose` callback.
         */
        if (_animatedIndex === -1 && _providedOnClose) {
          runOnJS(print)({
            component: BottomSheet.name,
            method: 'useAnimatedReaction::onClose',
            params: {
              animatedCurrentIndex: animatedCurrentIndex.value,
              animatedIndex: _animatedIndex,
            },
          });
          runOnJS(_providedOnClose)();
        }
      },
      [handleOnChange, _providedOnClose]
    );

    /**
     * React to `index` prop to snap the sheet to the new position.
     *
     * @alias onIndexChange
     */
    useEffect(() => {
      if (isAnimatedOnMount.value) {
        handleSnapToIndex(_providedIndex);
      }
    }, [
      _providedIndex,
      animatedCurrentIndex,
      isAnimatedOnMount,
      handleSnapToIndex,
    ]);
    //#endregion

    // render
    print({
      component: BottomSheet.name,
      method: 'render',
      params: {
        animatedSnapPoints: animatedSnapPoints.value,
        animatedCurrentIndex: animatedCurrentIndex.value,
        providedIndex: _providedIndex,
      },
    });
    return (
      <BottomSheetProvider value={externalContextVariables}>
        <BottomSheetInternalProvider value={internalContextVariables}>
          <BottomSheetGestureHandlersProvider
            gestureEventsHandlersHook={gestureEventsHandlersHook}
          >
            <BottomSheetBackdropContainer
              key="BottomSheetBackdropContainer"
              animatedIndex={animatedIndex}
              animatedPosition={animatedPosition}
              backdropComponent={backdropComponent}
            />
            <BottomSheetContainer
              key="BottomSheetContainer"
              shouldCalculateHeight={!$modal}
              containerHeight={_animatedContainerHeight}
              containerOffset={animatedContainerOffset}
              topInset={topInset}
              bottomInset={bottomInset}
              detached={detached}
              style={_providedContainerStyle}
            >
              <Animated.View style={containerStyle}>
                <BottomSheetBackgroundContainer
                  key="BottomSheetBackgroundContainer"
                  animatedIndex={animatedIndex}
                  animatedPosition={animatedPosition}
                  backgroundComponent={backgroundComponent}
                  backgroundStyle={_providedBackgroundStyle}
                />
                <Animated.View
                  // pointerEvents="box-none"
                  style={contentMaskContainerStyle}
                  accessible={false}
                  // accessibilityRole={_providedAccessibilityRole ?? undefined}
                  // accessibilityLabel={_providedAccessibilityLabel ?? undefined}
                  accessible={_providedAccessible ?? undefined}
                  accessibilityRole={_providedAccessibilityRole ?? undefined}
                  accessibilityLabel={_providedAccessibilityLabel ?? undefined}
                >
                  <BottomSheetDraggableView
                    key="BottomSheetRootDraggableView"
                    style={contentContainerStyle}
                  >
                    {children}

                    {footerComponent && (
                      <BottomSheetFooterContainer
                        footerComponent={footerComponent}
                      />
                    )}
                  </BottomSheetDraggableView>
                </Animated.View>
                <BottomSheetHandleContainer
                  key="BottomSheetHandleContainer"
                  animatedIndex={animatedIndex}
                  animatedPosition={animatedPosition}
                  handleHeight={animatedHandleHeight}
                  enableHandlePanningGesture={enableHandlePanningGesture}
                  enableOverDrag={enableOverDrag}
                  enablePanDownToClose={enablePanDownToClose}
                  overDragResistanceFactor={overDragResistanceFactor}
                  keyboardBehavior={keyboardBehavior}
                  handleComponent={handleComponent}
                  handleStyle={_providedHandleStyle}
                  handleIndicatorStyle={_providedHandleIndicatorStyle}
                />
              </Animated.View>
              {/* <BottomSheetDebugView
                values={{
                  // topInset,
                  // bottomInset,
                  animatedSheetState,
                  // animatedScrollableState,
                  // animatedScrollableOverrideState,
                  // isScrollableRefreshable,
                  // animatedScrollableContentOffsetY,
                  // keyboardState,
                  animatedIndex,
                  animatedCurrentIndex,
                  animatedPosition,
                  animatedHandleGestureState,
                  animatedContentGestureState,
                  animatedContainerHeight,
                  animatedSheetHeight,
                  animatedHandleHeight,
                  animatedContentHeight,
                  // // keyboardHeight,
                  // isLayoutCalculated,
                  // isContentHeightFixed,
                  // isInTemporaryPosition,
                }}
              /> */}
            </BottomSheetContainer>
          </BottomSheetGestureHandlersProvider>
        </BottomSheetInternalProvider>
      </BottomSheetProvider>
    );
  }
);

const BottomSheet = memo(BottomSheetComponent);
BottomSheet.displayName = 'BottomSheet';

export default BottomSheet;
