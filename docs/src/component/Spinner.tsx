function Spinner() {
  return (
    <span className="inline-flex items-center">
      <span className="relative inline-block size-[1em] place-self-center self-center rounded-full align-middle">
        <span className="spinner-ring-color absolute inset-0 rounded-full border-1" />
        <span className="spinner-segment-color absolute inset-0 rounded-full border-1 border-transparent motion-safe:animate-spin" />
      </span>
      &zwnj;
    </span>
  )
}

export default Spinner
