//! Ownership-safe Rust boundary for the C-compatible Box3D adapter.

#[repr(C)]
pub struct BodyState {
    pub id: u64,
    pub x: f64,
    pub y: f64,
    pub angle: f64,
    pub vx: f64,
    pub vy: f64,
    pub angular_velocity: f64,
}

#[repr(C)]
struct OpaqueWorld {
    _private: [u8; 0],
}

unsafe extern "C" {
    fn lag_world_create(gravity_x: f64, gravity_y: f64) -> *mut OpaqueWorld;
    fn lag_world_destroy(world: *mut OpaqueWorld);
    fn lag_world_step(world: *mut OpaqueWorld, dt: f64, solver_iterations: i32) -> i32;
}

pub struct World {
    raw: *mut OpaqueWorld,
}

impl World {
    pub fn new(gravity_x: f64, gravity_y: f64) -> Option<Self> {
        let raw = unsafe { lag_world_create(gravity_x, gravity_y) };
        (!raw.is_null()).then_some(Self { raw })
    }

    pub fn step(&mut self, dt: f64, solver_iterations: i32) -> Result<(), i32> {
        let result = unsafe { lag_world_step(self.raw, dt, solver_iterations) };
        (result == 0).then_some(()).ok_or(result)
    }
}

impl Drop for World {
    fn drop(&mut self) {
        unsafe { lag_world_destroy(self.raw) };
    }
}

unsafe impl Send for World {}

#[no_mangle]
pub extern "C" fn lag_rust_abi_version() -> u32 {
    1
}
