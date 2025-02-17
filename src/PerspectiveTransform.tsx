import React, {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  MouseEvent,
  ReactNode,
  FC,
} from "react";
import "./style.css";

export interface Corner {
  x: number;
  y: number;
}

export interface Points {
  topLeft: Corner;
  topRight: Corner;
  bottomRight: Corner;
  bottomLeft: Corner;
}

export interface PerspectiveTransformProps {
  children: ReactNode;
  points?: Points;
  onPointsChange?: (points: Points) => void;
  storageKey?: string;
  editable?: boolean;
  onEditableChange?: (nextEditable: boolean) => void;
  toggleKeys?: string[];
}

const PerspectiveTransform: FC<PerspectiveTransformProps> = ({
  children,
  points: controlledPoints,
  onPointsChange,
  storageKey,
  editable,
  onEditableChange,
  toggleKeys = ["p"],
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [points, setPoints] = useState<Points>(
    controlledPoints || {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomRight: { x: 100, y: 100 },
      bottomLeft: { x: 0, y: 100 },
    }
  );

  const [localEditable, setLocalEditable] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [matrix, setMatrix] = useState("");

  const isEditMode = editable !== undefined ? editable : localEditable;

  // Save points to localStorage whenever they change, but only after hydration
  useEffect(() => {
    if (storageKey && hasHydrated) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(points));
      } catch (e) {
        console.error("Failed to store perspective points", e);
      }
    }
  }, [points, storageKey, hasHydrated]);

  // Handle controlled points
  useEffect(() => {
    if (controlledPoints) {
      setPoints(controlledPoints);
    }
  }, [controlledPoints]);

  // Load points from localStorage on mount
  useEffect(() => {
    if (controlledPoints || !storageKey) return;

    const saved = localStorage.getItem(storageKey);
    console.log("Loaded points from localStorage:", saved);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Points;
        if (
          parsed.topLeft &&
          parsed.topRight &&
          parsed.bottomRight &&
          parsed.bottomLeft
        ) {
          setPoints(parsed);
        }
      } catch (e) {
        console.error("Failed to parse stored perspective points", e);
      }
    }
    setHasHydrated(true);
  }, [storageKey, controlledPoints]);

  // Toggle edit mode with SHIFT + toggleKeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && toggleKeys.includes(e.key.toLowerCase())) {
        if (onEditableChange) {
          onEditableChange(!isEditMode);
        } else {
          setLocalEditable((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditMode, onEditableChange, toggleKeys]);

  // ResizeObserver to auto-fit points
  useLayoutEffect(() => {
    if (controlledPoints || hasHydrated || !containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setPoints((prevPoints) => ({
          ...prevPoints,
          topRight: { x: width, y: 0 },
          bottomRight: { x: width, y: height },
          bottomLeft: { x: 0, y: height },
        }));
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, [controlledPoints, hasHydrated]);

  // Compute the CSS transform matrix
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const srcCorners: Corner[] = [
      { x: 0, y: 0 },
      { x: rect.width, y: 0 },
      { x: rect.width, y: rect.height },
      { x: 0, y: rect.height },
    ];
    const dstCorners: Corner[] = [
      points.topLeft,
      points.topRight,
      points.bottomRight,
      points.bottomLeft,
    ];
    const transform = computeCssMatrix(srcCorners, dstCorners);
    setMatrix(transform);
  }, [points]);

  function computeCssMatrix(srcPoints: Corner[], dstPoints: Corner[]): string {
    function solve(A: number[], b: number[]): number[] | null {
      const det =
        A[0] * (A[4] * A[8] - A[5] * A[7]) -
        A[1] * (A[3] * A[8] - A[5] * A[6]) +
        A[2] * (A[3] * A[7] - A[4] * A[6]);

      if (det === 0) return null;
      const invDet = 1 / det;

      const adjA = [
        A[4] * A[8] - A[5] * A[7],
        A[2] * A[7] - A[1] * A[8],
        A[1] * A[5] - A[2] * A[4],
        A[5] * A[6] - A[3] * A[8],
        A[0] * A[8] - A[2] * A[6],
        A[2] * A[3] - A[0] * A[5],
        A[3] * A[7] - A[4] * A[6],
        A[1] * A[6] - A[0] * A[7],
        A[0] * A[4] - A[1] * A[3],
      ].map((val) => val * invDet);

      return [
        adjA[0] * b[0] + adjA[1] * b[1] + adjA[2] * b[2],
        adjA[3] * b[0] + adjA[4] * b[1] + adjA[5] * b[2],
        adjA[6] * b[0] + adjA[7] * b[1] + adjA[8] * b[2],
      ];
    }

    function adj(m: number[]): number[] {
      return [
        m[4] * m[8] - m[5] * m[7],
        m[2] * m[7] - m[1] * m[8],
        m[1] * m[5] - m[2] * m[4],
        m[5] * m[6] - m[3] * m[8],
        m[0] * m[8] - m[2] * m[6],
        m[2] * m[3] - m[0] * m[5],
        m[3] * m[7] - m[4] * m[6],
        m[1] * m[6] - m[0] * m[7],
        m[0] * m[4] - m[1] * m[3],
      ];
    }

    function multmm(a: number[], b: number[]): number[] {
      const c: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 3; j += 1) {
          let cij = 0;
          for (let k = 0; k < 3; k += 1) {
            cij += a[3 * i + k] * b[3 * k + j];
          }
          c[3 * i + j] = cij;
        }
      }
      return c;
    }

    function basisToPoints(
      p1: Corner,
      p2: Corner,
      p3: Corner,
      p4: Corner
    ): number[] | null {
      const m = [p1.x, p2.x, p3.x, p1.y, p2.y, p3.y, 1, 1, 1];
      const v = [p4.x, p4.y, 1];
      const s = solve(m, v);
      if (s === null) return null;
      const m2 = [
        m[0] * s[0],
        m[1] * s[1],
        m[2] * s[2],
        m[3] * s[0],
        m[4] * s[1],
        m[5] * s[2],
        m[6] * s[0],
        m[7] * s[1],
        m[8] * s[2],
      ];
      return m2;
    }

    const m1 = basisToPoints(
      srcPoints[0],
      srcPoints[1],
      srcPoints[2],
      srcPoints[3]
    );
    const m2 = basisToPoints(
      dstPoints[0],
      dstPoints[1],
      dstPoints[2],
      dstPoints[3]
    );
    if (!m1 || !m2) return "";

    const m3 = multmm(m2, adj(m1));
    for (let i = 0; i < m3.length; i += 1) {
      m3[i] /= m3[8];
    }

    const matrix3d = [
      m3[0],
      m3[3],
      0,
      m3[6],
      m3[1],
      m3[4],
      0,
      m3[7],
      0,
      0,
      1,
      0,
      m3[2],
      m3[5],
      0,
      m3[8],
    ];

    return `matrix3d(${matrix3d.join(",")})`;
  }

  const handleDrag = (e: React.MouseEvent<HTMLDivElement>, corner: string) => {
    e.preventDefault();
    e.stopPropagation();

    const onMove = (event: globalThis.MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const updatedPoints = {
          ...points,
          [corner]: { x, y },
        };

        setPoints(updatedPoints);
        onPointsChange?.(updatedPoints);
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={containerRef} className="perspective-container">
      <div
        style={{
          transform: matrix,
          transformOrigin: "0 0",
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {isEditMode && <div className="alignment-guides" />}
        {children}
      </div>

      {isEditMode &&
        Object.entries(points).map(([corner, { x, y }]) => (
          <div
            key={corner}
            className="control-point"
            style={{ left: x, top: y }}
            onMouseDown={(e) => handleDrag(e, corner)}
          />
        ))}
    </div>
  );
};

export default PerspectiveTransform;
