---
created: 2026-07-12
tags: [ima2-gen, phase, gallery, chaining]
---

# Phase 040 — 갤러리 체이닝 + 가상화 (서버 무변경)

스펙: `004_gallery-chaining.md` 4-1·4-3. 전부 기존 서버 경로(XMP 복원,
I2V 프레임 소스, 참조 슬롯)의 재배선이라 UI-only로 끝난다. 기능 추가처럼
보이지만 신규 API가 없어서 이 위치.

## 범위

1. 체이닝 액션 공용 모듈(`resultChaining.ts`) + 타일 호버 오버레이:
   영상으로 / 편집 / 참조로 / 다시 굽기. 모바일 탭 → 액션 시트.
2. `GalleryImageTile`·`HistoryStrip`·`ResultActions`·뷰어가 같은 액션
   정의 공유.
3. 갤러리/피드 가상화 + 비디오 썸네일 IntersectionObserver 게이트.
4. 리니지 대비: 체이닝으로 생성되는 결과물 XMP에 `parentId` 기록
   (필드만, 뷰 없음 — 090 미결정 원장 참조).

## Done 기준

- 체이닝 4액션 컨텍스트 이동 계약 테스트.
- 1,000타일 스크롤 프로파일 수치 기록(전/후) → `assets/040/`.

상태: **done** (2026-07-13 — 체이닝 4액션+가상화+sol 8항목 감사, 1133 테스트 green)

## Diff-Level Record

커밋: `4ca3d55` (`4ca3d55c62308ee8e923ecc2d2ab951cf00a1841`);
비교 범위 `6be0d4b..4ca3d55` — **8 files, +415 / -24**.

| 파일 | Diff | 변경 기록 |
|---|---:|---|
| `ui/src/lib/resultChaining.ts` | +116 / -0 | `CHAINING_ACTIONS` 공용 registry와 `animate`, `edit`, `useAsRef`, `rebake` 4액션; availability predicate 및 toast 처리 |
| `ui/src/components/GalleryImageTile.tsx` | +78 / -0 | 갤러리 item 위에 공용 chaining action icon overlay 추가 |
| `ui/src/components/GalleryModal.tsx` | +56 / -0 | `useLazyGalleryTiles`, `IntersectionObserver`, `visibleKeys`, 200% root margin 및 미지원 fallback |
| `ui/src/components/HistoryStrip.tsx` | +75 / -22 | 전체 item 렌더 -> viewport/window 기반 virtualization으로 렌더 범위 제한 |
| `ui/src/styles/gallery-modal.css` | +71 / -1 | tile action overlay, placeholder/lazy 상태 스타일 |
| `ui/src/i18n/en.json` | +9 / -0 | chaining action 영문 label/toast |
| `ui/src/i18n/ko.json` | +9 / -0 | chaining action 한글 label/toast |
| `tests/gallery-navigation-ux-contract.test.js` | +1 / -1 | 갤러리 navigation 계약을 새 tile/chaining 구조에 맞게 갱신 |

Before -> After:

- 결과별 후속 동작이 각 화면에 흩어짐 -> `CHAINING_ACTIONS` 한곳에서 4개 액션의 표시 가능성과 실행을 정의.
- 갤러리 타일은 보기 전에도 모두 실체 DOM으로 렌더 -> `IntersectionObserver`가 근접한 placeholder만 실제 `GalleryImageTile`로 승격.
- HistoryStrip이 전체 history를 한 번에 렌더 -> 현재 viewport 주변 window만 렌더하는 virtualization.
- 결과 확인이 소비의 종착점 -> 타일 overlay에서 영상화, 편집, 참조 추가, 다시 굽기로 즉시 이어지는 작업 출발점.

## 전체 파일 변경표

`git diff --numstat 6be0d4b..4ca3d55` 기준의 전체 8개 파일이다. 합계는
415 additions / 24 deletions이며 서버 route, API schema, persistence 파일은
변경되지 않았다.

| # | 파일 | 추가 | 삭제 | 변경 책임 |
|---:|---|---:|---:|---|
| 1 | `tests/gallery-navigation-ux-contract.test.js` | 1 | 1 | gallery tile의 새 navigation/chaining 구조를 계약에 반영 |
| 2 | `ui/src/components/GalleryImageTile.tsx` | 78 | 0 | action overlay, icon, filtering, click execution 추가 |
| 3 | `ui/src/components/GalleryModal.tsx` | 56 | 0 | 세로 grid용 lazy tile observer와 placeholder 추가 |
| 4 | `ui/src/components/HistoryStrip.tsx` | 75 | 22 | 가로/세로 strip용 lazy thumb wrapper로 렌더 경계 변경 |
| 5 | `ui/src/i18n/en.json` | 9 | 0 | action label, aria label, toast 영문 추가 |
| 6 | `ui/src/i18n/ko.json` | 9 | 0 | 동일 key shape의 한국어 copy 추가 |
| 7 | `ui/src/lib/resultChaining.ts` | 116 | 0 | action registry와 공용 executor 신설 |
| 8 | `ui/src/styles/gallery-modal.css` | 71 | 1 | overlay, button, focus, placeholder visibility 스타일 |
| **합계** | **8 files** | **415** | **24** | **UI-only, existing server paths 재사용** |

변경을 책임별로 다시 묶으면 registry/execution 1개 파일, 소비 surface 3개
파일, 표현 1개 파일, 번역 2개 파일, contract 1개 파일이다.

```text
resultChaining.ts
  ├─ GalleryImageTile.tsx
  ├─ GalleryModal.tsx (tile mount gate)
  └─ HistoryStrip.tsx (thumb mount gate)

gallery-modal.css ─ overlay / focus / placeholder
en.json + ko.json ─ labels / toast
contract test ─ navigation selector expectation
```

## Chaining Actions 상세

### 공통 action contract

표시 가능한 액션과 실제 실행은 분리된다. registry는 serializable한 id,
translation key, pure availability predicate만 가진다.

```ts
export type ChainingActionId =
  | "animate"
  | "edit"
  | "useAsRef"
  | "rebake";

export interface ChainingAction {
  id: ChainingActionId;
  labelKey: string;
  /** Return false to hide the action for this item. */
  available: (item: GenerateItem) => boolean;
}
```

전체 registry는 다음과 같다.

```ts
export const CHAINING_ACTIONS: ChainingAction[] = [
  {
    id: "animate",
    labelKey: "chain.animate",
    available: (item) => Boolean(item.filename) && !isVideoItem(item),
  },
  {
    id: "edit",
    labelKey: "chain.edit",
    available: (item) => Boolean(item.filename) && !isVideoItem(item),
  },
  {
    id: "useAsRef",
    labelKey: "chain.useAsRef",
    available: (item) => Boolean(item.image || item.url),
  },
  {
    id: "rebake",
    labelKey: "chain.rebake",
    available: (item) => Boolean(item.prompt || item.filename),
  },
];
```

| action | availability | 필요한 source | 기존 경로 |
|---|---|---|---|
| `animate` | filename 존재, video 아님 | 저장된 image filename | `animateImage` |
| `edit` | filename 존재, video 아님 | history item | `selectHistory` + `openCanvas` |
| `useAsRef` | image 또는 url 존재 | fetch 가능한 media URL | `addReferences` |
| `rebake` | prompt 또는 filename 존재 | XMP/metadata 복원 가능 item | `continueFromItem` |

### 1. animate

목적은 정지 이미지를 기존 I2V 진입점으로 보내는 것이다. 이미 video인 item은
재애니메이션 대상으로 노출하지 않는다. filename이 없는 transient item도
서버가 frame source를 찾을 수 없으므로 숨긴다.

```ts
{
  id: "animate",
  labelKey: "chain.animate",
  available: (item) => Boolean(item.filename) && !isVideoItem(item),
}
```

실행 시 filename을 필수 인자로, prompt를 선택 인자로 전달한다.

```ts
case "animate": {
  if (!item.filename) return;
  try {
    await store.animateImage(
      item.filename,
      item.prompt ?? undefined,
    );
    store.showToast(t("toast.animateDone"));
  } catch (error) {
    store.showToast(
      error instanceof Error
        ? error.message
        : t("toast.animateFailed"),
      true,
    );
  }
  break;
}
```

실행 흐름:

```text
tile action click
  → filename guard
  → existing animateImage(filename, prompt)
  → success toast
  ↘ thrown Error: provider message toast(error=true)
  ↘ unknown error: translated fallback toast(error=true)
```

predicate와 executor 양쪽에 filename guard가 있다. predicate는 UI 노출을
막고 executor guard는 다른 future consumer가 직접 호출해도 잘못된 요청을
보내지 않게 한다.

### 2. edit

편집은 새 endpoint를 호출하지 않는다. 현재 history selection을 item으로
바꾼 뒤 기존 canvas를 연다.

```ts
{
  id: "edit",
  labelKey: "chain.edit",
  available: (item) => Boolean(item.filename) && !isVideoItem(item),
}
```

```ts
case "edit": {
  store.selectHistory(item);
  store.openCanvas();
  break;
}
```

실행 순서가 중요하다. `openCanvas()`가 먼저 실행되면 canvas가 이전 selection을
초기 source로 읽을 수 있다. selection을 먼저 확정함으로써 기존 viewer/history
상태가 편집 context의 진실원이 된다.

```text
image item
  → selectHistory(item)
  → currentImage/current selection 갱신
  → openCanvas()
  → canvas가 선택된 결과를 편집 source로 사용
```

video를 숨기는 이유는 현재 canvas edit path가 정지 image source를 전제로 하기
때문이다. availability가 capability boundary를 UI에 투영한다.

### 3. useAsRef

참조 추가는 item의 `url`을 우선하고 없으면 `image`를 사용한다.

```ts
{
  id: "useAsRef",
  labelKey: "chain.useAsRef",
  available: (item) => Boolean(item.image || item.url),
}
```

브라우저의 reference pipeline이 `File[]`을 받기 때문에 URL을 blob과 File로
변환한 뒤 기존 `addReferences`를 호출한다.

```ts
case "useAsRef": {
  const src = item.url || item.image;
  if (!src) return;
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    const file = new File(
      [blob],
      item.filename || "reference.png",
      { type: blob.type },
    );
    await store.addReferences([file]);
    store.showToast(t("chain.refAdded"));
  } catch {
    store.showToast(t("chain.refFailed"), true);
  }
  break;
}
```

실행 흐름:

```text
url || image
  → fetch(source)
  → response.blob()
  → File(blob, filename || reference.png, blob.type)
  → addReferences([file])
  → translated success toast
```

이 adapter 덕분에 reference store는 gallery URL이라는 새 입력 타입을 알 필요가
없다. 기존 upload/drop path와 동일한 `File` contract만 계속 받는다.

주의할 실패 경계는 fetch, blob conversion, reference decoding/upload다. 모두
하나의 translated error toast로 귀결되며 overlay click은 gallery selection을
동시에 바꾸지 않는다.

### 4. rebake

다시 굽기는 prompt 또는 filename이 있으면 노출된다. prompt가 직접 있으면
그 값을, filename만 있으면 기존 metadata/XMP 복원 경로를 사용할 수 있다.

```ts
{
  id: "rebake",
  labelKey: "chain.rebake",
  available: (item) => Boolean(item.prompt || item.filename),
}
```

`continueFromItem`은 동적 import된다.

```ts
case "rebake": {
  try {
    const { continueFromItem } = await import("./continueFromItem");
    const result = await continueFromItem(item);
    store.showToast(t(
      result.hasPrompt
        ? "toast.forkStarted"
        : "toast.forkStartedNoPrompt",
    ));
  } catch {
    store.showToast(t("toast.forkFailed"), true);
  }

  const promptEl = document.querySelector<HTMLTextAreaElement>(
    'textarea[name="prompt"], textarea#prompt, .sidebar textarea',
  );
  if (promptEl) {
    promptEl.focus();
    promptEl.setSelectionRange(
      promptEl.value.length,
      promptEl.value.length,
    );
  }
  break;
}
```

동적 import는 gallery tile의 기본 bundle path가 metadata continuation code를
즉시 평가하지 않게 한다. 성공 toast는 prompt 복원 여부를 구분한다. 마지막
focus 단계는 사용자를 composer로 이동시키고 caret을 복원된 prompt 끝에 둔다.

```text
item(prompt || filename)
  → lazy import continueFromItem
  → prompt/settings metadata 복원
  → hasPrompt별 toast
  → composer query
  → focus + caret at end
```

focus는 continuation 실패 후에도 시도된다. 실패 toast를 본 사용자가 prompt를
직접 보완해 계속 작업할 수 있는 recovery path를 남긴다.

## IntersectionObserver 가상화

이 phase의 가상화는 index window를 계산하는 완전한 list virtualization이
아니라, 안정적인 placeholder DOM을 유지하면서 무거운 tile/thumb content만
viewport 근처에서 mount하는 lazy rendering이다.

### GalleryModal: 세로 grid observer

hook은 observer, key→node map, 한 번이라도 근접한 key 집합을 보유한다.

```ts
function useLazyGalleryTiles(root: HTMLDivElement | null) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodesRef = useRef(new Map<string, HTMLElement>());
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      const entered = entries.filter((entry) => entry.isIntersecting);
      if (entered.length === 0) return;

      setVisibleKeys((current) => {
        const next = new Set(current);
        for (const entry of entered) {
          const key = (entry.target as HTMLElement)
            .dataset.galleryLazyKey;
          if (key) next.add(key);
        }
        return next;
      });
    }, {
      root,
      rootMargin: "200% 0px",
    });

    observerRef.current = observer;
    for (const node of nodesRef.current.values()) {
      observer.observe(node);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [root]);

  return {
    visibleKeys,
    register,
    supported: typeof IntersectionObserver !== "undefined",
  };
}
```

`rootMargin: "200% 0px"`는 viewport 높이의 위/아래 2배까지 미리 승격한다.
가로 margin은 0이다. gallery grid가 세로 scroll container이므로 이동 축에만
prefetch budget을 쓴다.

### register lifecycle

callback ref는 교체된 node를 unobserve하고 새 node를 observe한다.

```ts
const register = useCallback((key: string, node: HTMLElement | null) => {
  const previous = nodesRef.current.get(key);
  if (previous && previous !== node) {
    observerRef.current?.unobserve(previous);
  }

  if (node) {
    nodesRef.current.set(key, node);
    observerRef.current?.observe(node);
  } else {
    nodesRef.current.delete(key);
  }
}, []);
```

observer가 root보다 늦게 만들어져도 `nodesRef.current.values()`를 순회해 이미
등록된 placeholder를 관찰한다. 반대로 filter/sort로 node가 제거되면 map에서도
삭제한다.

### placeholder에서 real tile로 승격

각 item key는 gallery navigation ref와 lazy observer에 동시에 등록된다.

```tsx
const setItemRef = (node: HTMLElement | null) => {
  itemRefs.current[itemKey] = node;
  lazyTiles.register(itemKey, node);
};

const shouldRender = lazyTiles.supported
  ? lazyTiles.visibleKeys.has(itemKey)
  : true;

if (!shouldRender) {
  return (
    <div
      ref={setItemRef}
      key={`${keyPrefix}-${itemKey}`}
      className="gallery__tile-wrap"
      data-gallery-lazy-key={itemKey}
      style={{ aspectRatio: "1 / 1" }}
      aria-hidden="true"
    />
  );
}
```

placeholder가 `aspectRatio: "1 / 1"`을 가지므로 실제 image tile이 mount될 때
grid 높이가 급변하지 않는다. `aria-hidden`은 아직 interactive content가 없는
빈 셀을 accessibility tree에서 제외한다.

### visibleKeys retention

observer callback은 key를 추가만 하고 제거하지 않는다.

```ts
setVisibleKeys((current) => {
  const next = new Set(current);
  for (const entry of entered) {
    const key = getKey(entry.target);
    if (key) next.add(key);
  }
  return next;
});
```

이 retention에는 의도적인 trade-off가 있다.

- 한 번 본 tile은 다시 placeholder로 퇴행하지 않는다.
- 위아래로 왕복할 때 image decode와 component mount가 반복되지 않는다.
- keyboard focus를 가진 action button이 viewport 이탈만으로 unmount되지 않는다.
- 긴 session에서 결국 본 모든 tile이 mount될 수 있으므로 무한 목록의 엄격한
  memory bound는 아니다.

Phase 040의 목표는 초기 1,000 tile mount burst를 줄이는 것이며, 이미 본 결과를
aggressive하게 회수하는 recycle system은 범위 밖이다.

### unsupported fallback

지원 여부는 hook return에 명시된다.

```ts
supported: typeof IntersectionObserver !== "undefined"
```

consumer는 미지원 환경에서 모든 content를 렌더한다.

```ts
const shouldRender = lazyTiles.supported
  ? lazyTiles.visibleKeys.has(itemKey)
  : true;
```

따라서 오래된 browser/test DOM에서 observer가 없다고 gallery가 빈 placeholder로
고정되지 않는다. 성능 최적화만 빠지고 기능과 접근성은 유지되는 progressive
enhancement다.

### HistoryStrip: 이동 축별 margin

HistoryStrip은 같은 구조를 쓰되 horizontal/vertical layout 모두 고려해 양쪽
가로 margin을 크게 둔다.

```ts
const observer = new IntersectionObserver(callback, {
  root,
  rootMargin: "0px 200% 0px 200%",
});
```

GalleryModal과의 차이는 다음과 같다.

| surface | rootMargin | prefetch 축 | placeholder |
|---|---|---|---|
| GalleryModal | `200% 0px` | 위/아래 | 정사각 `gallery__tile-wrap` |
| HistoryStrip | `0px 200% 0px 200%` | 좌/우 | 고정 `history-thumb` wrapper |

HistoryStrip은 content를 wrapper 안에서 조건부 렌더한다.

```tsx
const renderLazyThumb = (key: string, content: ReactNode) => {
  const shouldRender = lazyThumbs.supported
    ? lazyThumbs.visibleKeys.has(key)
    : true;

  return (
    <div
      key={key}
      ref={(node) => {
        thumbRefs.current[key] = node;
        lazyThumbs.register(key, node);
      }}
      className="history-thumb"
      data-history-lazy-key={key}
      aria-hidden={shouldRender ? undefined : true}
      style={{ padding: 0, overflow: "hidden" }}
    >
      {shouldRender ? content : null}
    </div>
  );
};
```

collection thumb, video thumb, image thumb가 모두 이 helper를 통과한다. wrapper가
scroll target ref를 소유하므로 active item의 `scrollIntoView`도 content mount
여부와 독립적으로 동작한다.

## 결과 체이닝 아키텍처

### registry와 executor의 책임 분리

registry는 화면이 어떤 버튼을 보여야 하는지 결정한다. executor는 action id를
기존 store/lib operation으로 변환한다.

```text
GenerateItem
  → CHAINING_ACTIONS.filter(action.available)
  → translated buttons
  → click(action.id)
  → executeChaining(action.id, item, getStore, t)
  → existing application operation
```

이 분리로 tile은 `animate`가 어떤 toast를 쓰는지, `rebake`가 어떤 module을
import하는지 알지 않는다. 반대로 executor는 hover overlay, icon, mobile touch
target을 알지 않는다.

새 surface가 추가될 때 필요한 최소 integration은 registry를 filter하고 같은
executor를 호출하는 것이다.

```ts
const actions = CHAINING_ACTIONS.filter((action) =>
  action.available(item),
);

await executeChaining(
  action.id,
  item,
  getStore,
  t,
);
```

### store subscription avoidance

GalleryImageTile은 필요한 store method를 selector hook으로 구독하지 않는다.
버튼을 누르는 순간 `useAppStore.getState()`에서 읽는다.

```tsx
await executeChaining(
  actionId,
  item,
  () => {
    const s = useAppStore.getState();
    return {
      animateImage: s.animateImage,
      openCanvas: s.openCanvas,
      selectHistory: s.selectHistory,
      addReferences: s.addReferences,
      showToast: s.showToast,
    };
  },
  t,
);
```

타일 수가 많으므로 각 tile이 store state 변화에 반응하는 subscription을 만들면
gallery와 무관한 상태 변경에도 selector 평가/리렌더 비용이 누적될 수 있다.
여기서 필요한 값은 렌더 데이터가 아니라 event-time command다. `getState()`가
그 ownership에 맞는다.

executor가 store 전체 타입을 받지 않고 필요한 method shape만 선언한 점도
중요하다.

```ts
getStore: () => {
  animateImage: (filename: string, prompt?: string) => Promise<void>;
  openCanvas: () => void;
  selectHistory: (item: GenerateItem) => void;
  addReferences: (files: File[]) => Promise<void>;
  showToast: (message: string, isError?: boolean) => void;
}
```

이는 공용 module이 Zustand store의 전체 state shape에 결합되는 것을 막고,
실행에 필요한 capability를 문서화한다.

### overlay availability memoization

item별 버튼 집합은 registry predicate로 계산하고 item이 바뀔 때만 다시 만든다.

```tsx
const availableActions = useMemo(
  () => CHAINING_ACTIONS.filter((action) => action.available(item)),
  [item],
);
```

각 button은 registry의 id와 label key를 그대로 소비한다.

```tsx
<div
  className="gallery__chain-overlay"
  role="group"
  aria-label={t("chain.ariaLabel")}
>
  {availableActions.map((action) => (
    <button
      key={action.id}
      type="button"
      className="gallery__chain-btn"
      onClick={(event) => void handleChain(action.id, event)}
      title={t(action.labelKey)}
      aria-label={t(action.labelKey)}
    >
      <ChainIcon id={action.id} />
    </button>
  ))}
</div>
```

icon-only button이므로 `title`만으로 끝내지 않고 `aria-label`을 제공한다. group도
번역된 label을 가져 keyboard/screen-reader 사용자가 action cluster의 목적을
알 수 있다.

### stopPropagation pattern

tile 본체는 item selection button이다. 그 위의 chaining action click이 bubble되면
action 실행과 tile selection/modal navigation이 동시에 발생할 수 있다.

```tsx
const handleChain = useCallback(async (
  actionId: ChainingActionId,
  event: MouseEvent<HTMLButtonElement>,
) => {
  event.stopPropagation();

  await executeChaining(
    actionId,
    item,
    getStore,
    t,
  );
}, [item, t]);
```

이 패턴이 보장하는 것은 다음과 같다.

1. animate click은 viewer selection 변경 없이 animation workflow만 시작한다.
2. useAsRef click은 modal을 닫거나 tile을 재선택하지 않는다.
3. rebake click은 composer focus를 tile click handler가 다시 빼앗지 않는다.
4. edit는 executor가 명시적으로 `selectHistory`를 호출하므로 selection side
   effect가 우연한 bubbling이 아니라 action contract에 속한다.

`preventDefault()`가 아니라 `stopPropagation()`인 이유도 명확하다. button의
기본 keyboard/click semantics는 유지하면서 부모 tile의 click만 차단해야 한다.

### always-DOM overlay와 접근성

overlay는 hover 순간에 React tree에 새로 생기지 않는다. available action이 있으면
항상 DOM에 있고 CSS가 시각 노출을 제어한다.

```tsx
{/* always in DOM for keyboard access; CSS controls visibility */}
{availableActions.length > 0 ? (
  <div className="gallery__chain-overlay" role="group">
    {/* action buttons */}
  </div>
) : null}
```

따라서 pointer hover가 없는 keyboard user도 tab으로 action에 도달할 수 있다.
focus-visible 상태는 hover visibility와 별개로 overlay/button을 드러내야 한다.
mobile에서는 36px touch target 규칙이 적용되어 14px SVG 자체보다 충분히 큰
interactive area를 제공한다.

### 오류 경계와 toast ownership

각 async action은 executor 내부에서 오류를 translated toast로 변환한다.
consumer surface가 try/catch와 copy를 반복하지 않는다.

| action | async failure | 사용자 피드백 |
|---|---|---|
| animate | provider/I2V 호출 실패 | Error message 또는 `toast.animateFailed` |
| edit | 동기 context move | 별도 async error 없음 |
| useAsRef | fetch/blob/addReferences 실패 | `chain.refFailed` error toast |
| rebake | dynamic import/metadata restore 실패 | `toast.forkFailed` error toast |

registry에는 toast key나 실행 코드가 없고 executor에 모인다. label translation은
registry의 `labelKey`, 결과 feedback은 실행 branch의 toast key로 분리되어 같은
action 이름과 성공/실패 메시지를 독립적으로 다듬을 수 있다.

### 범위 경계

이 architecture는 기존 operation을 재배선하는 UI orchestration이다.

- `animateImage`의 서버 계약은 변경하지 않는다.
- canvas edit endpoint를 새로 만들지 않는다.
- reference upload schema를 바꾸지 않고 URL을 `File`로 adapt한다.
- rebake metadata parser를 복제하지 않고 `continueFromItem`을 재사용한다.
- lineage UI는 추가하지 않는다.

결과적으로 Phase 040의 새 public concept는 `ChainingActionId`와 action registry뿐이다.
실제 생성/편집/provider 로직의 진실원은 계속 기존 store와 lib path에 남는다.

## 검증 기록 해석

완료 상태의 `1133 테스트 green`은 4액션의 화면 연결과 기존 navigation 계약이
함께 유지됐다는 회귀 증거다. 이 phase를 재검증할 때는 단순 snapshot뿐 아니라
다음 경계를 확인해야 한다.

1. image tile에 animate/edit가 보이고 video item에는 보이지 않는다.
2. URL만 있는 item에는 useAsRef가 보인다.
3. prompt 또는 filename 중 하나만 있어도 rebake가 보인다.
4. action button click이 parent tile selection handler로 bubble되지 않는다.
5. observer 미지원 환경에서는 실제 tile/thumb가 모두 렌더된다.
6. observer 지원 환경에서는 placeholder의 aspect ratio가 grid shift를 막는다.
7. 한 번 visibleKeys에 들어간 item은 viewport 이탈 후에도 mount 상태를 유지한다.
8. HistoryStrip active key의 wrapper ref로 `scrollIntoView`가 계속 동작한다.

성능 수치의 핵심 관찰점은 초기 DOM에 placeholder wrapper는 남아 있어도 image,
video placeholder logic, action overlay 같은 무거운 subtree가 200% prefetch 범위
밖에서는 mount되지 않는다는 점이다. 따라서 "DOM node 0"이 아니라 "무거운
content의 bounded initial mount"가 이 구현의 정확한 성능 주장이다.
